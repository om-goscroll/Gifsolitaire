import * as THREE from 'three';
import { JOIN } from '../core/groups.js';
import { cropSquare } from '../core/media.js';

const Z_FRAME = 0;
const Z_TILE = 0.1;
const Z_MOVING = 0.5;
const Z_HELD = 1;
const Z_FLASH = 2;
const CURVE_SEGMENTS = 8;
/** Longest step a spring takes in one update, so a slow frame cannot make it explode. */
const MAX_STEP_S = 1 / 30;

/**
 * A rectangle from (x0, y0) to (x1, y1) with a separate radius for each corner
 * (0 = square corner).
 */
function cornerRectShape(x0, y0, x1, y1, rBottomLeft, rBottomRight, rTopRight, rTopLeft) {
  const shape = new THREE.Shape();
  shape.moveTo(x0 + rBottomLeft, y0);
  shape.lineTo(x1 - rBottomRight, y0);
  if (rBottomRight > 0) shape.absarc(x1 - rBottomRight, y0 + rBottomRight, rBottomRight, -Math.PI / 2, 0, false);
  shape.lineTo(x1, y1 - rTopRight);
  if (rTopRight > 0) shape.absarc(x1 - rTopRight, y1 - rTopRight, rTopRight, 0, Math.PI / 2, false);
  shape.lineTo(x0 + rTopLeft, y1);
  if (rTopLeft > 0) shape.absarc(x0 + rTopLeft, y1 - rTopLeft, rTopLeft, Math.PI / 2, Math.PI, false);
  shape.lineTo(x0, y0 + rBottomLeft);
  if (rBottomLeft > 0) shape.absarc(x0 + rBottomLeft, y0 + rBottomLeft, rBottomLeft, Math.PI, Math.PI * 1.5, false);
  return shape;
}

/** A rectangle with four equal rounded corners, centred on the origin. */
function roundedRectShape(width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  return cornerRectShape(-width / 2, -height / 2, width / 2, height / 2, r, r, r, r);
}

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
/** Ease out past the end and back. overshoot 0 = no overshoot. */
const easeOutBack = (t, overshoot) => 1 + (overshoot + 1) * Math.pow(t - 1, 3) + overshoot * Math.pow(t - 1, 2);

/** The flash over a finished picture, with a band of light that sweeps across it. */
const FLASH_VERTEX = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FLASH_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFlash;
  uniform float uShine;
  uniform float uHalf;
  varying vec2 vPos;
  void main() {
    vec2 p = vPos / uHalf;
    float diagonal = (p.x + p.y) * 0.5;
    float centre = mix(-1.5, 1.5, uShine);
    float band = smoothstep(0.26, 0.0, abs(diagonal - centre));
    float shineOn = step(0.0001, uShine) * (1.0 - step(0.9999, uShine));
    gl_FragColor = vec4(uColor, clamp(uFlash + band * 0.6 * shineOn, 0.0, 1.0));
  }
`;

/**
 * Draws the board with three.js: a frame, and one mesh per tile. All tiles
 * share one texture and each shows its own slice of it through its UVs.
 *
 * The picture is mapped across the whole board, gaps included, so when two
 * joined tiles grow to close the gap between them the picture runs straight
 * across the seam.
 *
 * Every tile has a rest position (where tweens move it) and a spring-driven
 * scale around a pivot (its group's centre), which is how hover, merge bounce,
 * landing squash and the level-start pop-in all work without fighting each
 * other. A held group is placed around the pointer instead.
 *
 * @example
 * const view = new BoardView({ scene, texture, board, config: CONFIG });
 * view.setJoins(joinMasks(board));
 * // every frame:
 * view.update(deltaMs);
 */
export class BoardView {
  /**
   * @param {object} deps
   * @param {THREE.Scene} deps.scene Scene to add the board to.
   * @param {THREE.Texture} deps.texture The puzzle picture.
   * @param {import('../core/board.js').Board} deps.board Board state to mirror.
   * @param {object} deps.config The game CONFIG.
   * @param {boolean} [deps.reducedMotion=false] Skip decorative motion (pop-in, bounce, lean, nudge).
   * @param {object} [deps.trim] The level's trim (see cropSquare in core/media.js).
   */
  constructor({ scene, texture, board, config, reducedMotion = false, trim }) {
    this.board = board;
    this.config = config;
    this.juice = config.juice;
    this.reducedMotion = reducedMotion;
    this.root = new THREE.Group();
    scene.add(this.root);

    const { size, padding, gap, frameRadius } = config.board;
    const inner = size - padding * 2;
    this.pitchX = (inner + gap) / board.cols;
    this.pitchY = (inner + gap) / board.rows;
    this.tileW = this.pitchX - gap;
    this.tileH = this.pitchY - gap;
    this.left = -inner / 2;
    this.top = inner / 2;
    const mediaImage = texture.image;
    const mediaW = mediaImage.videoWidth || mediaImage.width || 512;
    const mediaH = mediaImage.videoHeight || mediaImage.height || 512;
    this.crop = BoardView.cropUV(mediaW, mediaH, trim);

    /** Called once each time the last moving tile comes to rest. */
    this.onSettle = null;

    const frame = new THREE.Mesh(
      new THREE.ShapeGeometry(roundedRectShape(size, size, frameRadius), 12),
      new THREE.MeshBasicMaterial({ color: config.colors.frame }),
    );
    frame.position.z = Z_FRAME;
    this.root.add(frame);

    // White sheet over the picture with a light sweep, invisible until the puzzle is solved.
    this.flash = new THREE.Mesh(
      new THREE.ShapeGeometry(roundedRectShape(inner, inner, config.board.tileRadius), CURVE_SEGMENTS),
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(config.colors.winFlash) },
          uFlash: { value: 0 },
          uShine: { value: 0 },
          uHalf: { value: inner / 2 },
        },
        vertexShader: FLASH_VERTEX,
        fragmentShader: FLASH_FRAGMENT,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.flash.position.z = Z_FLASH;
    this.flash.visible = false;
    this.root.add(this.flash);
    /** Milliseconds into the win effect, or -1 when it is not playing. */
    this.winElapsed = -1;

    this.shadowMaterial = new THREE.MeshBasicMaterial({
      color: config.colors.shadow,
      transparent: true,
      opacity: 0,
    });
    /** Tiles currently casting a shadow, and how strong the shadow is (0-1). */
    this.shadowTiles = new Set();
    this.shadowAmount = 0;
    this.shadowTarget = 0;

    /** tiles[tileId] = the group holding that tile's picture and shadow. */
    this.tiles = [];
    /** Running position animations. */
    this.tweens = [];
    /** Running rotation animations. */
    this.rotTweens = [];
    /** The group being held, or null. */
    this.hold = null;
    /** Tiles under the pointer. */
    this.hovered = [];
    /** Groups waiting to land (squash) once their slide ends. */
    this.landings = [];
    /** The hint nudge, or null. */
    this.hintMotion = null;

    for (let tileId = 0; tileId < board.size; tileId++) {
      const group = new THREE.Group();
      // The shadow shares the picture's geometry, so a merged group casts one joined-up shadow.
      const geometry = this.#buildTileGeometry(tileId, 0);
      const shadow = new THREE.Mesh(geometry, this.shadowMaterial);
      shadow.position.set(config.drag.shadowOffset, -config.drag.shadowOffset, -0.05);
      shadow.visible = false;
      group.add(shadow);

      // Each tile has its own material so it can glow on its own.
      const material = new THREE.MeshBasicMaterial({ map: texture });
      const picture = new THREE.Mesh(geometry, material);
      group.add(picture);

      const at = this.cellCenter(board.cellOf(tileId));
      group.position.set(at.x, at.y, Z_TILE);
      group.userData = {
        shadow,
        picture,
        material,
        mask: 0,
        base: { x: at.x, y: at.y },
        baseRot: -board.rotationOf(tileId) * (Math.PI / 2),
        // Spring-driven scale around a pivot.
        s: 1,
        v: 0,
        target: 1,
        pivot: { x: at.x, y: at.y },
        glow: 0,
      };
      group.rotation.z = group.userData.baseRot;
      this.root.add(group);
      this.tiles.push(group);
    }

    // Tiles pop in one after another when the level starts.
    this.introElapsed = 0;
    this.introMs = 0;
    if (!reducedMotion) {
      // The last tile to pop is the bottom-right one (see #updateIntro).
      this.introMs = this.juice.introTileMs + this.#introDelay(board.cols - 1 + board.rows - 1);
      for (const tile of this.tiles) tile.userData.s = 0;
    }
  }

  /**
   * The level's square of an image (see cropSquare), as UV bounds. v runs up
   * from the bottom of the image.
   * @returns {{u0: number, u1: number, v0: number, v1: number}}
   * @example BoardView.cropUV(1440, 1080) // { u0: 0.125, u1: 0.875, v0: 0, v1: 1 }
   */
  static cropUV(imageWidth, imageHeight, trim) {
    const { x, y, side } = cropSquare(imageWidth, imageHeight, trim);
    return {
      u0: x / imageWidth,
      u1: (x + side) / imageWidth,
      v0: 1 - (y + side) / imageHeight,
      v1: 1 - y / imageHeight,
    };
  }

  /**
   * Build a tile's shape for a set of joined sides. A joined side grows by half
   * the gap to meet its neighbour, and a corner is rounded only when both sides
   * that meet there are free.
   */
  #buildTileGeometry(tileId, mask) {
    const { gap, tileRadius } = this.config.board;
    const half = gap / 2;
    const joinedLeft = (mask & JOIN.LEFT) !== 0;
    const joinedRight = (mask & JOIN.RIGHT) !== 0;
    const joinedUp = (mask & JOIN.UP) !== 0;
    const joinedDown = (mask & JOIN.DOWN) !== 0;

    const x0 = -this.tileW / 2 - (joinedLeft ? half : 0);
    const x1 = this.tileW / 2 + (joinedRight ? half : 0);
    const y0 = -this.tileH / 2 - (joinedDown ? half : 0);
    const y1 = this.tileH / 2 + (joinedUp ? half : 0);
    const r = Math.min(tileRadius, this.tileW / 2, this.tileH / 2);

    const geometry = new THREE.ShapeGeometry(
      cornerRectShape(
        x0,
        y0,
        x1,
        y1,
        joinedLeft || joinedDown ? 0 : r,
        joinedRight || joinedDown ? 0 : r,
        joinedRight || joinedUp ? 0 : r,
        joinedLeft || joinedUp ? 0 : r,
      ),
      CURVE_SEGMENTS,
    );

    // Map the picture by where each vertex sits on the solved board.
    const home = this.cellCenter(tileId);
    const boardW = this.board.cols * this.pitchX;
    const boardH = this.board.rows * this.pitchY;
    const { u0, u1, v0, v1 } = this.crop;
    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const fx = (home.x + pos.getX(i) - this.left + half) / boardW;
      const fy = (this.top + half - (home.y + pos.getY(i))) / boardH;
      uv.setXY(i, u0 + fx * (u1 - u0), v1 - fy * (v1 - v0));
    }
    uv.needsUpdate = true;
    return geometry;
  }

  /**
   * Show which tiles are joined: joined sides close up and lose their rounded
   * corners, so a group reads as one piece.
   * @param {number[]} masks masks[cell] = JOIN flags, from joinMasks(board).
   * @example view.setJoins(joinMasks(board));
   */
  setJoins(masks) {
    for (let cell = 0; cell < this.board.size; cell++) {
      const tileId = this.board.tileAt(cell);
      const tile = this.tiles[tileId];
      if (tile.userData.mask === masks[cell]) continue;
      tile.userData.picture.geometry.dispose();
      const geometry = this.#buildTileGeometry(tileId, masks[cell]);
      tile.userData.picture.geometry = geometry;
      tile.userData.shadow.geometry = geometry;
      tile.userData.mask = masks[cell];
    }
  }

  /**
   * World position of the centre of a cell.
   * @returns {{x: number, y: number}}
   */
  cellCenter(cell) {
    const { col, row } = this.board.colRow(cell);
    return {
      x: this.left + col * this.pitchX + this.tileW / 2,
      y: this.top - row * this.pitchY - this.tileH / 2,
    };
  }

  /**
   * The cell under a world point.
   * @returns {number} The cell index, or -1 when the point is off the board.
   */
  cellFromPoint(x, y) {
    const gap = this.config.board.gap;
    const col = Math.floor((x - this.left + gap / 2) / this.pitchX);
    const row = Math.floor((this.top - y + gap / 2) / this.pitchY);
    if (col < 0 || col >= this.board.cols || row < 0 || row >= this.board.rows) return -1;
    return this.board.cellIndex(col, row);
  }

  /** Rest position of a tile (where it is, or where it is sliding from). */
  tilePosition(tileId) {
    const { base } = this.tiles[tileId].userData;
    return { x: base.x, y: base.y };
  }

  /** The middle of a set of tiles' rest positions. */
  #centreOf(tileIds) {
    let x = 0;
    let y = 0;
    for (const id of tileIds) {
      x += this.tiles[id].userData.base.x;
      y += this.tiles[id].userData.base.y;
    }
    return { x: x / tileIds.length, y: y / tileIds.length };
  }

  /** Point every tile in a set at the same pivot, so the set scales as one piece. */
  #setPivot(tileIds) {
    const centre = this.#centreOf(tileIds);
    for (const id of tileIds) {
      const { pivot } = this.tiles[id].userData;
      pivot.x = centre.x;
      pivot.y = centre.y;
    }
  }

  /**
   * Grow the tiles under the pointer slightly. Pass the whole group so it grows
   * as one piece; pass [] (or null) to clear.
   * @param {number[] | null} tileIds
   */
  setHover(tileIds) {
    const next = tileIds ?? [];
    if (next.length === this.hovered.length && next.every((id, i) => id === this.hovered[i])) return;
    for (const id of this.hovered) this.tiles[id].userData.target = 1;
    this.hovered = this.reducedMotion ? [] : [...next];
    if (this.hovered.length === 0) return;
    this.#setPivot(this.hovered);
    for (const id of this.hovered) this.tiles[id].userData.target = this.juice.hoverScale;
  }

  /**
   * Pick up a group: it grows with a springy pop, casts a shadow and follows
   * the anchor (the grabbed tile's centre) from now on.
   * @param {{tileId: number, dx: number, dy: number}[]} pieces Each tile and its offset from the anchor.
   * @param {number} anchorX
   * @param {number} anchorY
   * @example view.beginHold(pieces, grabbed.x, grabbed.y);
   */
  beginHold(pieces, anchorX, anchorY) {
    this.setHover(null);
    this.clearHintMotion();
    this.shadowTiles.clear();
    for (const piece of pieces) {
      const tile = this.tiles[piece.tileId];
      this.#cancelTween(tile);
      tile.position.z = Z_HELD;
      tile.userData.target = 1;
      tile.userData.s = 1;
      tile.userData.v = 0;
      tile.userData.shadow.visible = true;
      this.shadowTiles.add(piece.tileId);
    }
    this.shadowTarget = 1;
    this.hold = {
      pieces,
      anchorX,
      anchorY,
      lastAnchorX: anchorX,
      s: 1,
      v: this.reducedMotion ? 0 : this.juice.liftImpulse,
      vx: 0,
      tilt: 0,
    };
  }

  /** Move the held group's anchor to a world point. */
  moveHold(anchorX, anchorY) {
    if (!this.hold) return;
    this.hold.anchorX = anchorX;
    this.hold.anchorY = anchorY;
  }

  /**
   * Let go of the held group where it is. The tiles keep their current size and
   * spring back to normal; slide them to their cells afterwards.
   */
  endHold() {
    if (!this.hold) return;
    for (const piece of this.hold.pieces) {
      const tile = this.tiles[piece.tileId];
      tile.userData.base.x = tile.position.x;
      tile.userData.base.y = tile.position.y;
      tile.userData.s = this.hold.s;
      tile.userData.v = 0;
      tile.userData.target = 1;
      tile.userData.pivot.x = tile.position.x;
      tile.userData.pivot.y = tile.position.y;
      tile.rotation.z = tile.userData.baseRot;
    }
    this.shadowTarget = 0;
    this.hold = null;
  }

  /**
   * Slide a tile to the centre of a cell.
   * @param {number} tileId
   * @param {number} cell Destination cell.
   * @param {number} durationMs Slide time.
   * @param {boolean} [onTop=false] Draw above other moving tiles while sliding.
   * @param {'cubic' | 'back'} [ease='cubic'] 'back' overshoots slightly, for a snappy drop.
   */
  slideToCell(tileId, cell, durationMs, onTop = false, ease = 'cubic') {
    const tile = this.tiles[tileId];
    this.#cancelTween(tile);
    const to = this.cellCenter(cell);
    tile.position.z = onTop ? Z_HELD : Z_MOVING;
    const overshoot = ease === 'back' && !this.reducedMotion ? this.juice.dropOvershoot : 0;
    this.tweens.push({
      tile,
      fromX: tile.userData.base.x,
      fromY: tile.userData.base.y,
      toX: to.x,
      toY: to.y,
      elapsed: 0,
      duration: Math.max(1, durationMs),
      overshoot,
    });
  }

  /**
   * Squash a group when it lands, once its slide has finished.
   * @param {number[]} tileIds
   */
  queueLanding(tileIds) {
    if (this.reducedMotion || tileIds.length === 0) return;
    this.landings.push([...tileIds]);
  }

  /**
   * Bounce and glow a group: the "locked into place" feedback.
   * @param {number[]} tileIds
   * @param {{impulse?: number, glow?: number}} [options] Defaults come from config.juice.
   * @example view.pulseGroup(cells.map((cell) => board.tileAt(cell)));
   */
  pulseGroup(tileIds, { impulse = this.juice.mergeImpulse, glow = this.juice.mergeGlow } = {}) {
    if (tileIds.length === 0) return;
    this.#setPivot(tileIds);
    for (const id of tileIds) {
      const data = this.tiles[id].userData;
      if (!this.reducedMotion) data.v += impulse;
      data.glow = Math.max(data.glow, glow);
    }
  }

  /** Smoothly rotate a tile 90° clockwise to its new quarter-turn orientation. */
  rotateTileQuarterTurn(tileId, targetQuarterTurns, durationMs) {
    const tile = this.tiles[tileId];
    this.#cancelRotTween(tile);
    const fromAngle = tile.userData.baseRot;
    tile.position.z = Z_MOVING;
    this.rotTweens.push({
      tile,
      fromAngle,
      toAngle: fromAngle - Math.PI / 2,
      finalAngle: -targetQuarterTurns * (Math.PI / 2),
      elapsed: 0,
      duration: Math.max(1, durationMs),
    });
    if (!this.reducedMotion) {
      this.#setPivot([tileId]);
      tile.userData.v -= this.juice.mergeImpulse * 0.6;
    }
  }

  /**
   * Make hinted tiles nudge toward where they should go (or wiggle, for a tile
   * that needs rotating), until clearHintMotion() or the next pick-up.
   * @param {number[]} tileIds
   * @param {{dx: number, dy: number} | null} direction Unit direction to nudge, or null to wiggle.
   */
  setHintMotion(tileIds, direction) {
    if (this.reducedMotion) return;
    this.clearHintMotion();
    this.hintMotion = { tileIds: [...tileIds], direction, elapsed: 0 };
  }

  /** Stop any hint nudge. */
  clearHintMotion() {
    this.hintMotion = null;
  }

  /** True while any tile is still sliding, rotating or popping in. */
  get isAnimating() {
    return this.tweens.length > 0 || this.rotTweens.length > 0 || this.introElapsed < this.introMs;
  }

  /**
   * Advance animations. Calls onSettle when the last moving tile stops.
   * @param {number} deltaMs Time since the last update.
   */
  update(deltaMs) {
    const wasAnimating = this.isAnimating;
    this.#updateWin(deltaMs);
    this.#updateIntro(deltaMs);
    this.#updateTweens(deltaMs);
    this.#updateLandings();
    this.#updateSprings(deltaMs);
    this.#updateHold(deltaMs);
    this.#updateShadows(deltaMs);
    this.#applyTransforms(deltaMs);
    if (wasAnimating && !this.isAnimating && this.onSettle) this.onSettle();
  }

  /** When a tile on the given diagonal (col + row) starts popping in. */
  #introDelay(diagonal) {
    return diagonal * this.juice.introStaggerMs * 1.6;
  }

  #updateIntro(deltaMs) {
    if (this.introElapsed >= this.introMs) return;
    this.introElapsed = Math.min(this.introMs, this.introElapsed + deltaMs);
    // Pop in diagonally from the top-left corner.
    for (let cell = 0; cell < this.board.size; cell++) {
      const { col, row } = this.board.colRow(cell);
      const t = clamp01((this.introElapsed - this.#introDelay(col + row)) / this.juice.introTileMs);
      const data = this.tiles[this.board.tileAt(cell)].userData;
      data.s = t <= 0 ? 0 : easeOutBack(t, 1.7);
      data.v = 0;
      data.pivot.x = data.base.x;
      data.pivot.y = data.base.y;
    }
    if (this.introElapsed >= this.introMs) {
      for (const tile of this.tiles) tile.userData.s = 1;
    }
  }

  #updateTweens(deltaMs) {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.elapsed += deltaMs;
      const t = clamp01(tw.elapsed / tw.duration);
      const k = tw.overshoot > 0 ? easeOutBack(t, tw.overshoot) : easeOutCubic(t);
      const { base, pivot } = tw.tile.userData;
      base.x = tw.fromX + (tw.toX - tw.fromX) * k;
      base.y = tw.fromY + (tw.toY - tw.fromY) * k;
      pivot.x = base.x;
      pivot.y = base.y;
      if (tw.elapsed >= tw.duration) {
        base.x = tw.toX;
        base.y = tw.toY;
        tw.tile.position.z = Z_TILE;
        this.tweens.splice(i, 1);
      }
    }
    for (let i = this.rotTweens.length - 1; i >= 0; i--) {
      const tw = this.rotTweens[i];
      tw.elapsed += deltaMs;
      const k = easeOutBack(clamp01(tw.elapsed / tw.duration), this.reducedMotion ? 0 : 1.4);
      tw.tile.userData.baseRot = tw.fromAngle + (tw.toAngle - tw.fromAngle) * k;
      if (tw.elapsed >= tw.duration) {
        tw.tile.userData.baseRot = tw.finalAngle;
        tw.tile.position.z = Z_TILE;
        this.rotTweens.splice(i, 1);
      }
    }
  }

  #updateLandings() {
    for (let i = this.landings.length - 1; i >= 0; i--) {
      const ids = this.landings[i];
      if (ids.some((id) => this.tweens.some((tw) => tw.tile === this.tiles[id]))) continue;
      this.#setPivot(ids);
      for (const id of ids) this.tiles[id].userData.v += this.juice.landImpulse;
      this.landings.splice(i, 1);
    }
  }

  #updateSprings(deltaMs) {
    const { stiffness, damping } = this.juice.spring;
    const dt = Math.min(deltaMs / 1000, MAX_STEP_S);
    const glowKeep = Math.pow(0.5, deltaMs / Math.max(1, this.juice.glowHalfLifeMs));
    const introRunning = this.introElapsed < this.introMs;
    for (const tile of this.tiles) {
      const data = tile.userData;
      if (!introRunning) {
        data.v += (-stiffness * (data.s - data.target) - damping * data.v) * dt;
        data.s += data.v * dt;
        if (Math.abs(data.s - data.target) < 0.0005 && Math.abs(data.v) < 0.005) {
          data.s = data.target;
          data.v = 0;
        }
      }
      if (data.glow > 0.002) data.glow *= glowKeep;
      else data.glow = 0;
      data.material.color.setScalar(1 + data.glow);
    }
  }

  #updateHold(deltaMs) {
    if (!this.hold) return;
    const hold = this.hold;
    const { stiffness, damping } = this.juice.spring;
    const dt = Math.min(deltaMs / 1000, MAX_STEP_S);
    const lift = this.config.drag.liftScale;
    hold.v += (-stiffness * (hold.s - lift) - damping * hold.v) * dt;
    hold.s += hold.v * dt;

    // A single tile leans into the direction it is moving.
    if (hold.pieces.length === 1 && !this.reducedMotion && dt > 0) {
      const speed = (hold.anchorX - hold.lastAnchorX) / dt;
      hold.vx += (speed - hold.vx) * Math.min(1, dt * 18);
      const { maxTilt, tiltPerSpeed } = this.juice;
      const target = Math.max(-maxTilt, Math.min(maxTilt, -hold.vx * tiltPerSpeed));
      hold.tilt += (target - hold.tilt) * Math.min(1, dt * 14);
    }
    hold.lastAnchorX = hold.anchorX;
  }

  #updateShadows(deltaMs) {
    const step = Math.min(1, deltaMs / 120);
    this.shadowAmount += (this.shadowTarget - this.shadowAmount) * step;
    if (this.shadowTarget === 0 && this.shadowAmount < 0.01) {
      this.shadowAmount = 0;
      for (const id of this.shadowTiles) this.tiles[id].userData.shadow.visible = false;
      this.shadowTiles.clear();
    }
    this.shadowMaterial.opacity = this.config.drag.shadowOpacity * this.shadowAmount;
  }

  #applyTransforms(deltaMs) {
    const held = new Map();
    if (this.hold) for (const piece of this.hold.pieces) held.set(piece.tileId, piece);

    let nudge = null;
    if (this.hintMotion) {
      this.hintMotion.elapsed += deltaMs;
      const phase = (this.hintMotion.elapsed / this.config.hint.periodMs) * Math.PI * 2;
      nudge = { ids: new Set(this.hintMotion.tileIds), wave: 0.5 - 0.5 * Math.cos(phase), sin: Math.sin(phase) };
    }

    this.tiles.forEach((tile, tileId) => {
      const data = tile.userData;
      const piece = held.get(tileId);
      if (piece) {
        const s = this.hold.s;
        tile.position.x = this.hold.anchorX + piece.dx * s;
        tile.position.y = this.hold.anchorY + piece.dy * s;
        tile.scale.setScalar(s);
        tile.rotation.z = data.baseRot + this.hold.tilt;
        return;
      }
      let x = data.pivot.x + (data.base.x - data.pivot.x) * data.s;
      let y = data.pivot.y + (data.base.y - data.pivot.y) * data.s;
      let rot = data.baseRot;
      if (nudge?.ids.has(tileId)) {
        const { direction } = this.hintMotion;
        const amount = this.config.hint.nudge;
        if (direction) {
          x += direction.dx * amount * nudge.wave;
          y += direction.dy * amount * nudge.wave;
        } else {
          rot += nudge.sin * 0.09;
        }
      }
      tile.position.x = x;
      tile.position.y = y;
      tile.scale.setScalar(Math.max(0, data.s));
      tile.rotation.z = rot;
    });
  }

  /**
   * Play the solved effect: a white flash and a sweep of light across the
   * finished picture, every tile glowing, while the board pops slightly.
   * Timings come from config.win.
   * @example if (session.recordMove(board)) view.playWin();
   */
  playWin() {
    this.winElapsed = 0;
    this.flash.visible = true;
    this.flash.material.uniforms.uFlash.value = this.config.win.flashOpacity;
    this.flash.material.uniforms.uShine.value = 0;
    this.setHover(null);
    this.clearHintMotion();
    for (const tile of this.tiles) tile.userData.glow = Math.max(tile.userData.glow, this.config.win.tileGlow);
  }

  /** True while the solved effect is still playing. */
  get isWinPlaying() {
    return this.winElapsed >= 0;
  }

  #updateWin(deltaMs) {
    if (this.winElapsed < 0) return;
    this.winElapsed += deltaMs;
    const { flashMs, flashOpacity, popScale, popMs, shineDelayMs, shineMs } = this.config.win;
    const fade = clamp01(this.winElapsed / flashMs);
    const pop = clamp01(this.winElapsed / popMs);
    const shine = this.reducedMotion ? 1 : clamp01((this.winElapsed - shineDelayMs) / shineMs);
    const uniforms = this.flash.material.uniforms;
    uniforms.uFlash.value = flashOpacity * (1 - easeOutCubic(fade));
    uniforms.uShine.value = shine;
    this.root.scale.setScalar(this.reducedMotion ? 1 : 1 + (popScale - 1) * Math.sin(Math.PI * pop));
    if (fade >= 1 && pop >= 1 && shine >= 1) {
      this.winElapsed = -1;
      this.flash.visible = false;
      this.root.scale.setScalar(1);
    }
  }

  /**
   * Remove the board from the scene and free its geometry and materials. The
   * picture texture belongs to the caller and is left alone.
   * @example view.dispose(); media.dispose();
   */
  dispose() {
    this.root.removeFromParent();
    this.root.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) object.material.dispose();
    });
    this.tweens.length = 0;
    this.rotTweens.length = 0;
    this.landings.length = 0;
    this.hold = null;
    this.onSettle = null;
  }

  #cancelTween(tile) {
    const i = this.tweens.findIndex((tw) => tw.tile === tile);
    if (i >= 0) this.tweens.splice(i, 1);
  }

  #cancelRotTween(tile) {
    const i = this.rotTweens.findIndex((tw) => tw.tile === tile);
    if (i >= 0) this.rotTweens.splice(i, 1);
  }
}
