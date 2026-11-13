import * as THREE from 'three';
import { JOIN } from '../core/groups.js';
import { ICONS } from '../ui/icons.js';

const Z_OUTLINE = 1.4;
const Z_HINT = 1.6;
const Z_PARTICLE = 2.2;
const TWO_PI = Math.PI * 2;

/** Pack icons as textures, loaded once and shared by every level's effects. */
let iconTextures = null;
function getIconTextures() {
  if (iconTextures) return iconTextures;
  const loader = new THREE.TextureLoader();
  const load = (url) => {
    const texture = loader.load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  iconTextures = { stars: ICONS.stars.map(load), arrow: load(ICONS.hintArrow), rotate: load(ICONS.rotate) };
  return iconTextures;
}

/**
 * Short-lived visual effects on the board: a gold outline and sparkles when
 * tiles merge, and a burst of stars when the puzzle is solved. Purely visual;
 * it never changes game state. All sizes and timings come from config.effects.
 *
 * @example
 * const effects = new Effects({ parent: view.root, view, config: CONFIG });
 * effects.mergeFlash(cells, joinMasks(board));
 * // every frame:
 * effects.update(deltaMs);
 */
export class Effects {
  /**
   * @param {object} deps
   * @param {THREE.Object3D} deps.parent Object to add effect meshes to (the board root).
   * @param {import('./boardView.js').BoardView} deps.view Used for cell positions and tile sizes.
   * @param {object} deps.config The game CONFIG.
   * @param {() => number} [deps.random] Returns a float in [0, 1). Injected so a run can be repeated.
   */
  constructor({ parent, view, config, random = Math.random }) {
    this.parent = parent;
    this.view = view;
    this.config = config;
    this.random = random;
    /** Everything currently animating. */
    this.items = [];
    /** The hint overlay meshes, shown until clearHint(). */
    this.hintItems = [];
    this.textures = getIconTextures();
    // Stars and sparkles are the pack's star icon on a square, 2 units across (radius 1 at scale 1).
    this.iconGeometry = new THREE.PlaneGeometry(2, 2);
    this.confettiGeometry = new THREE.PlaneGeometry(1, 0.55);
  }

  /** Whether a hint is on screen. */
  get isHintShown() {
    return this.hintItems.length > 0;
  }

  /**
   * Show the player a move: the hinted piece pulses in gold, a white ghost
   * outline marks where it belongs, and an arrow icon halfway between them
   * points the way. A tile that needs rotating gets a spinning rotate icon instead.
   * @param {{kind: 'move' | 'rotate', cells: number[], dCol?: number, dRow?: number}} hint From findHint().
   * @param {number[]} masks masks[cell] = JOIN flags, from joinMasks(board).
   * @example effects.showHint(findHint(board), joinMasks(board));
   */
  showHint(hint, masks) {
    this.clearHint();
    const cfg = this.config.hint;
    const source = this.#hintMesh(this.#outlineGeometry(hint.cells, masks), cfg.sourceColor, 'hintPulse');
    source.position.z = Z_HINT;

    const centre = this.#centreOf(hint.cells);
    if (hint.kind === 'move') {
      const dx = hint.dCol * this.view.pitchX;
      const dy = -hint.dRow * this.view.pitchY;
      // The ghost outline is the same shape as the piece, moved to where it belongs.
      const target = this.#hintMesh(source.geometry.clone(), cfg.targetColor, 'hintGhost');
      target.position.set(dx, dy, Z_HINT);

      // The arrow icon sits halfway along the move and slides gently toward the target.
      const angle = Math.atan2(dy, dx);
      const tile = Math.min(this.view.tileW, this.view.tileH);
      const arrow = this.#iconMesh(this.textures.arrow, tile * cfg.arrowIconSize, 'hintArrow');
      arrow.position.set(centre.x + dx / 2, centre.y + dy / 2, Z_HINT + 0.02);
      // The icon points up (+y), so turn it a quarter less than the move's angle.
      arrow.rotation.z = angle - Math.PI / 2;
      const item = this.hintItems[this.hintItems.length - 1];
      item.baseX = arrow.position.x;
      item.baseY = arrow.position.y;
      item.dirX = Math.cos(angle);
      item.dirY = Math.sin(angle);
      item.slide = tile * 0.12;
    } else {
      const tile = Math.min(this.view.tileW, this.view.tileH);
      const icon = this.#iconMesh(this.textures.rotate, tile * cfg.rotateIconSize, 'hintSpin');
      icon.position.set(centre.x, centre.y, Z_HINT + 0.02);
    }
  }

  /** Remove the hint overlay. */
  clearHint() {
    for (const item of this.hintItems) this.#remove(item);
    this.hintItems.length = 0;
  }

  #hintMesh(geometry, color, kind) {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
    this.parent.add(mesh);
    this.hintItems.push({ kind, mesh, elapsed: 0, ownsGeometry: true });
    return mesh;
  }

  /** A square showing a pack icon, part of the hint overlay. */
  #iconMesh(texture, size, kind) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    this.parent.add(mesh);
    this.hintItems.push({ kind, mesh, elapsed: 0, ownsGeometry: true });
    return mesh;
  }

  #centreOf(cells) {
    let x = 0;
    let y = 0;
    for (const cell of cells) {
      const c = this.view.cellCenter(cell);
      x += c.x;
      y += c.y;
    }
    return { x: x / cells.length, y: y / cells.length };
  }

  #updateHint(deltaMs) {
    const period = this.config.hint.periodMs;
    for (const item of this.hintItems) {
      item.elapsed += deltaMs;
      const phase = (item.elapsed / period) * TWO_PI;
      const wave = 0.5 - 0.5 * Math.cos(phase);
      const { mesh } = item;
      if (item.kind === 'hintPulse') mesh.material.opacity = 0.55 + 0.45 * wave;
      else if (item.kind === 'hintGhost') mesh.material.opacity = 0.35 + 0.5 * wave;
      else if (item.kind === 'hintArrow') {
        mesh.material.opacity = 0.75 + 0.25 * wave;
        if (item.slide) {
          mesh.position.x = item.baseX + item.dirX * item.slide * wave;
          mesh.position.y = item.baseY + item.dirY * item.slide * wave;
        }
      } else if (item.kind === 'hintSpin') {
        mesh.rotation.z -= (deltaMs / 1000) * 2.4;
        mesh.material.opacity = 0.75 + 0.25 * wave;
      }
    }
  }

  /** True while any effect is still on screen. */
  get isPlaying() {
    return this.items.length > 0;
  }

  /**
   * Outline a newly merged group in gold and scatter sparkles over it.
   * @param {number[]} cells The group's cells.
   * @param {number[]} masks masks[cell] = JOIN flags, from joinMasks(board).
   * @param {{sparkles?: boolean}} [options] sparkles: false for the outline alone (the winning merge,
   *   so nothing sits over the finished picture).
   * @example for (const cells of findNewGroups(board, before)) effects.mergeFlash(cells, masks);
   */
  mergeFlash(cells, masks, { sparkles = true } = {}) {
    const { outlineMs, sparkleCount, sparkleMs, sparkleSize } = this.config.effects.merge;
    const { colors } = this.config;

    const outline = new THREE.Mesh(
      this.#outlineGeometry(cells, masks),
      new THREE.MeshBasicMaterial({ color: colors.mergeOutline, transparent: true }),
    );
    outline.position.z = Z_OUTLINE;
    this.parent.add(outline);
    this.items.push({ kind: 'outline', mesh: outline, elapsed: 0, duration: outlineMs, ownsGeometry: true });

    for (let i = 0; i < (sparkles ? sparkleCount : 0); i++) {
      const center = this.view.cellCenter(cells[Math.floor(this.random() * cells.length)]);
      const mesh = new THREE.Mesh(
        this.iconGeometry,
        new THREE.MeshBasicMaterial({ map: this.textures.stars[0], transparent: true, depthWrite: false }),
      );
      mesh.position.set(
        center.x + (this.random() - 0.5) * this.view.tileW,
        center.y + (this.random() - 0.5) * this.view.tileH,
        Z_PARTICLE,
      );
      mesh.rotation.z = this.random() * TWO_PI;
      mesh.scale.setScalar(0);
      this.parent.add(mesh);
      this.items.push({
        kind: 'sparkle',
        mesh,
        elapsed: -this.random() * sparkleMs * 0.5,
        duration: sparkleMs,
        size: sparkleSize * (0.6 + this.random() * 0.8),
        spin: (this.random() - 0.5) * 6,
      });
    }
  }

  /**
   * Celebrate a solved puzzle with a light burst of stars and paper confetti.
   * Every particle starts on the board's edge and flies outward, so the
   * finished picture in the middle stays clear. Counts, sizes and speeds come
   * from config.effects.win.
   * @example if (justWon) effects.winBurst();
   */
  winBurst() {
    const { starCount, starsMs, starSize, starSpeed, gravity, confettiCount = 0, confettiColors } = this.config.effects.win;

    for (let i = 0; i < starCount; i++) {
      const { x, y, nx, ny } = this.#edgePoint();
      const speed = starSpeed * (0.55 + this.random() * 0.6);
      const stars = this.textures.stars;
      const mesh = new THREE.Mesh(
        this.iconGeometry,
        new THREE.MeshBasicMaterial({ map: stars[i % stars.length], transparent: true, depthWrite: false }),
      );
      mesh.position.set(x, y, Z_PARTICLE);
      mesh.rotation.z = this.random() * TWO_PI;
      mesh.scale.setScalar(starSize * (0.6 + this.random() * 0.7));
      this.parent.add(mesh);
      const [vx, vy] = this.#outward(nx, ny, speed);
      this.items.push({
        kind: 'star',
        mesh,
        elapsed: 0,
        duration: starsMs * (0.75 + this.random() * 0.25),
        vx,
        vy: vy + starSpeed * 0.25,
        gravity,
        spin: (this.random() - 0.5) * 8,
      });
    }

    // Paper confetti: flutters (spins in 3D) and drifts down more slowly than the stars.
    const palette = confettiColors?.length ? confettiColors : ['#ffc531'];
    for (let i = 0; i < confettiCount; i++) {
      const { x, y, nx, ny } = this.#edgePoint();
      const speed = starSpeed * (0.6 + this.random() * 0.6);
      const mesh = new THREE.Mesh(
        this.confettiGeometry,
        new THREE.MeshBasicMaterial({ color: palette[i % palette.length], transparent: true, side: THREE.DoubleSide }),
      );
      mesh.position.set(x, y, Z_PARTICLE + 0.05);
      mesh.rotation.set(this.random() * TWO_PI, this.random() * TWO_PI, this.random() * TWO_PI);
      mesh.scale.setScalar(starSize * (0.65 + this.random() * 0.45));
      this.parent.add(mesh);
      const [vx, vy] = this.#outward(nx, ny, speed);
      this.items.push({
        kind: 'confetti',
        mesh,
        elapsed: 0,
        duration: starsMs * (1 + this.random() * 0.4),
        vx,
        vy: vy + starSpeed * 0.3,
        gravity: gravity * 0.55,
        drag: 1.6,
        flutter: 6 + this.random() * 8,
      });
    }
  }

  /** A random point on the edge of the picture, with the outward direction there. */
  #edgePoint() {
    const half = (this.config.board.size - this.config.board.padding * 2) / 2;
    const along = (this.random() * 2 - 1) * half;
    const side = Math.floor(this.random() * 4);
    if (side === 0) return { x: along, y: half, nx: 0, ny: 1 };
    if (side === 1) return { x: half, y: along, nx: 1, ny: 0 };
    if (side === 2) return { x: along, y: -half, nx: 0, ny: -1 };
    return { x: -half, y: along, nx: -1, ny: 0 };
  }

  /** A velocity pointing away from the picture, fanned up to 40 degrees either side. */
  #outward(nx, ny, speed) {
    const angle = Math.atan2(ny, nx) + (this.random() - 0.5) * 1.4;
    return [Math.cos(angle) * speed, Math.sin(angle) * speed];
  }


  /**
   * Advance every effect and remove the ones that have finished.
   * @param {number} deltaMs Time since the last update.
   */
  update(deltaMs) {
    if (this.hintItems.length > 0) this.#updateHint(deltaMs);
    if (this.items.length === 0) return;
    const seconds = deltaMs / 1000;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.elapsed += deltaMs;
      const t = Math.min(1, Math.max(0, item.elapsed / item.duration));
      const { mesh } = item;

      if (item.kind === 'outline') {
        mesh.material.opacity = 1 - t * t;
      } else if (item.kind === 'sparkle') {
        mesh.scale.setScalar(item.size * Math.sin(Math.PI * t));
        mesh.rotation.z += item.spin * seconds;
      } else if (item.kind === 'confetti') {
        const slow = Math.exp(-item.drag * seconds);
        item.vx *= slow;
        item.vy = item.vy * slow - item.gravity * seconds;
        mesh.position.x += item.vx * seconds;
        mesh.position.y += item.vy * seconds;
        mesh.rotation.x += item.flutter * seconds;
        mesh.rotation.y += item.flutter * 0.7 * seconds;
        mesh.material.opacity = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      } else {
        item.vy -= item.gravity * seconds;
        mesh.position.x += item.vx * seconds;
        mesh.position.y += item.vy * seconds;
        mesh.rotation.z += item.spin * seconds;
        mesh.material.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      }

      if (item.elapsed >= item.duration) {
        this.#remove(item);
        this.items.splice(i, 1);
      }
    }
  }

  /** Remove every effect immediately and free the shared geometry. */
  dispose() {
    for (const item of this.items) this.#remove(item);
    this.items.length = 0;
    this.clearHint();
    this.iconGeometry.dispose();
    this.confettiGeometry.dispose();
  }

  #remove(item) {
    item.mesh.removeFromParent();
    item.mesh.material.dispose();
    if (item.ownsGeometry) item.mesh.geometry.dispose();
  }

  /** A band along every outer edge of a group: each free side of each tile gets a strip. */
  #outlineGeometry(cells, masks) {
    const half = this.config.board.gap / 2;
    const h = this.config.effects.merge.outlineWidth / 2;
    const positions = [];
    const quad = (x0, y0, x1, y1) => {
      positions.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y0, 0, x1, y1, 0, x0, y1, 0);
    };

    for (const cell of cells) {
      const mask = masks[cell];
      const left = (mask & JOIN.LEFT) !== 0;
      const right = (mask & JOIN.RIGHT) !== 0;
      const up = (mask & JOIN.UP) !== 0;
      const down = (mask & JOIN.DOWN) !== 0;
      const center = this.view.cellCenter(cell);
      const x0 = center.x - this.view.tileW / 2 - (left ? half : 0);
      const x1 = center.x + this.view.tileW / 2 + (right ? half : 0);
      const y0 = center.y - this.view.tileH / 2 - (down ? half : 0);
      const y1 = center.y + this.view.tileH / 2 + (up ? half : 0);
      // A strip reaches past a free corner so the corners of the outline close up.
      if (!left) quad(x0 - h, y0 - (down ? 0 : h), x0 + h, y1 + (up ? 0 : h));
      if (!right) quad(x1 - h, y0 - (down ? 0 : h), x1 + h, y1 + (up ? 0 : h));
      if (!down) quad(x0 - (left ? 0 : h), y0 - h, x1 + (right ? 0 : h), y0 + h);
      if (!up) quad(x0 - (left ? 0 : h), y1 - h, x1 + (right ? 0 : h), y1 + h);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
  }
}
