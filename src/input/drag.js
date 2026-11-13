import * as THREE from 'three';
import { findGroups, clampGroupOffset, planGroupMove } from '../core/groups.js';
import { ICONS } from '../ui/icons.js';

const DRAG_THRESHOLD_PX = 8;

/** The cursor over a tile that rotates: the pack's rotate icon, scaled to 32px once it loads. */
let rotateCursor = 'pointer';
if (typeof Image !== 'undefined') {
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    canvas.getContext('2d').drawImage(image, 0, 0, 32, 32);
    rotateCursor = `url("${canvas.toDataURL('image/png')}") 16 16, pointer`;
  };
  image.src = ICONS.rotateCursor;
}

/**
 * Pointer input for the board: pick up a tile (and everything merged with it),
 * carry it, and drop it somewhere else. In Bonus Levels (`allowRotate: true`),
 * tapping an unmerged 1x1 tile rotates it 90° clockwise instead of dragging.
 * Works with mouse and touch; a cancelled or lost pointer puts the tiles back.
 *
 * @example
 * const drag = new DragController({ dom: renderer.domElement, camera, board, view, config: CONFIG });
 * drag.enabled = false; // ignore input during a banner
 */
export class DragController {
  /**
   * @param {object} deps
   * @param {HTMLElement} deps.dom Element that receives pointer events (the canvas).
   * @param {THREE.Camera} deps.camera Camera used to map screen points to the board.
   * @param {import('../core/board.js').Board} deps.board Board state to change.
   * @param {import('../render/boardView.js').BoardView} deps.view View to move tiles in.
   * @param {object} deps.config The game CONFIG.
   * @param {boolean} [deps.allowDrag=true] Allow dragging and swapping tiles/groups.
   * @param {boolean} [deps.allowRotate=false] Enable tap-to-rotate 90° CW for unmerged tiles.
   * @param {(cells: number[]) => void} [deps.onPickUp] A group was lifted.
   * @param {(tileId: number) => void} [deps.onRotate] A tile was rotated by a tap.
   * @param {(moves: object[]) => void} [deps.onDrop] A group was dropped on a new place.
   * @param {() => void} [deps.onInvalid] A group was dropped off the board and went back.
   * @param {(moves: object[]) => void} [deps.onMove] After each successful drop or rotation.
   */
  constructor({
    dom,
    camera,
    board,
    view,
    config,
    allowDrag = true,
    allowRotate = false,
    onPickUp,
    onRotate,
    onDrop,
    onInvalid,
    onMove,
  }) {
    this.dom = dom;
    this.camera = camera;
    this.board = board;
    this.view = view;
    this.config = config;
    this.allowDrag = allowDrag;
    this.allowRotate = allowRotate;
    const noop = () => {};
    this.onPickUp = onPickUp ?? noop;
    this.onRotate = onRotate ?? noop;
    this.onDrop = onDrop ?? noop;
    this.onInvalid = onInvalid ?? noop;
    this.onMove = onMove ?? noop;
    /** Set to false to ignore input (banners, the win sequence, the map). */
    this.enabled = true;
    this.held = null;
    /** Scratch vector reused for every pointer event. */
    this.scratch = new THREE.Vector3();
    this.lastPoint = null;

    this.handleDown = (e) => this.#onDown(e);
    this.handleMove = (e) => this.#onMove(e);
    this.handleUp = (e) => this.#onUp(e);
    this.handleCancel = (e) => this.#onCancel(e);
    this.handleLeave = () => {
      this.lastPoint = null;
      if (!this.held) {
        this.dom.style.cursor = 'default';
        this.view.setHover(null);
      }
    };
    dom.addEventListener('pointerdown', this.handleDown);
    dom.addEventListener('pointermove', this.handleMove);
    dom.addEventListener('pointerup', this.handleUp);
    dom.addEventListener('pointercancel', this.handleCancel);
    dom.addEventListener('lostpointercapture', this.handleCancel);
    dom.addEventListener('pointerleave', this.handleLeave);
  }

  /** Remove all listeners. */
  dispose() {
    this.dom.style.cursor = 'default';
    this.dom.classList.remove('dragging');
    this.dom.removeEventListener('pointerdown', this.handleDown);
    this.dom.removeEventListener('pointermove', this.handleMove);
    this.dom.removeEventListener('pointerup', this.handleUp);
    this.dom.removeEventListener('pointercancel', this.handleCancel);
    this.dom.removeEventListener('lostpointercapture', this.handleCancel);
    this.dom.removeEventListener('pointerleave', this.handleLeave);
  }

  /** Whether a tile or group is being held right now. */
  get isHolding() {
    return this.held !== null;
  }

  /** Convert a pointer event to a point on the board plane. */
  #worldPoint(event) {
    const rect = this.dom.getBoundingClientRect();
    const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    const p = this.scratch.set(ndcX, ndcY, 0).unproject(this.camera);
    return { x: p.x, y: p.y };
  }

  /** Capture or release the pointer. A failure here must never interrupt a drag. */
  #capture(pointerId, on) {
    try {
      if (on) this.dom.setPointerCapture(pointerId);
      else this.dom.releasePointerCapture(pointerId);
    } catch {
      // The pointer is already gone (or was never active): nothing to capture.
    }
  }

  /** The tiles that would move if the player grabbed this cell, or null if nothing can be done there. */
  #grabbableAt(point) {
    if (!this.enabled || !point || this.view.isAnimating) return null;
    const cell = this.view.cellFromPoint(point.x, point.y);
    if (cell < 0) return null;
    const { groupOf, groups } = findGroups(this.board);
    const cells = groups[groupOf[cell]];
    const canRotate = this.allowRotate && cells.length === 1;
    if (!this.allowDrag && !canRotate) return null;
    return { cell, cells, canRotate };
  }

  /** Highlight what is under the pointer and show the matching cursor. */
  #updateHover(point) {
    if (this.held?.isDragging) {
      this.dom.style.cursor = 'grabbing';
      return;
    }
    const target = this.#grabbableAt(point);
    if (!target) {
      this.dom.style.cursor = 'default';
      this.view.setHover(null);
      return;
    }
    this.dom.style.cursor = !this.allowDrag && target.canRotate ? rotateCursor : 'grab';
    this.view.setHover(target.cells.map((cell) => this.board.tileAt(cell)));
  }

  #onDown(event) {
    const point = this.#worldPoint(event);
    this.lastPoint = point;
    if (this.held) return;
    const target = this.#grabbableAt(point);
    if (!target) {
      this.#updateHover(point);
      return;
    }
    const { cell, cells, canRotate } = target;

    const grabbed = this.view.cellCenter(cell);
    const pieces = cells.map((groupCell) => {
      const center = this.view.cellCenter(groupCell);
      return {
        tileId: this.board.tileAt(groupCell),
        cell: groupCell,
        dx: center.x - grabbed.x,
        dy: center.y - grabbed.y,
      };
    });

    this.held = {
      pointerId: event.pointerId,
      originCell: cell,
      cells,
      pieces,
      offsetX: grabbed.x - point.x,
      offsetY: grabbed.y - point.y,
      anchorX: grabbed.x,
      anchorY: grabbed.y,
      startClientX: event.clientX,
      startClientY: event.clientY,
      canTapRotate: canRotate,
      isDragging: this.allowDrag && !canRotate,
    };
    this.#capture(event.pointerId, true);
    if (this.held.isDragging) this.#beginLift();
  }

  #beginLift() {
    this.view.beginHold(this.held.pieces, this.held.anchorX, this.held.anchorY);
    this.onPickUp(this.held.cells);
    this.dom.classList.add('dragging');
    this.dom.style.cursor = 'grabbing';
  }

  #onMove(event) {
    const point = this.#worldPoint(event);
    this.lastPoint = point;
    if (!this.held || event.pointerId !== this.held.pointerId) {
      this.#updateHover(point);
      return;
    }
    if (!this.allowDrag) return;
    if (!this.held.isDragging) {
      const dist = Math.hypot(event.clientX - this.held.startClientX, event.clientY - this.held.startClientY);
      if (dist < DRAG_THRESHOLD_PX) return;
      this.held.isDragging = true;
      this.#beginLift();
    }
    this.held.anchorX = point.x + this.held.offsetX;
    this.held.anchorY = point.y + this.held.offsetY;
    this.view.moveHold(this.held.anchorX, this.held.anchorY);
  }

  /** Take the held group out of the player's hand. */
  #release(event) {
    const held = this.held;
    this.held = null;
    this.#capture(event.pointerId, false);
    this.dom.classList.remove('dragging');
    if (held.isDragging) this.view.endHold();
    return held;
  }

  /** The pointer was cancelled or lost: put everything back where it was. */
  #onCancel(event) {
    if (!this.held || event.pointerId !== this.held.pointerId) return;
    const held = this.#release(event);
    if (!held.isDragging) return;
    for (const piece of held.pieces) this.view.slideToCell(piece.tileId, piece.cell, this.config.anim.returnMs, true, 'back');
  }

  #onUp(event) {
    if (!this.held || event.pointerId !== this.held.pointerId) return;
    const held = this.#release(event);
    const { originCell, cells, pieces, anchorX, anchorY, isDragging, canTapRotate } = held;

    if (!isDragging && canTapRotate) {
      const tileId = pieces[0].tileId;
      const nextRot = this.board.rotateTile(tileId);
      this.view.rotateTileQuarterTurn(tileId, nextRot, this.config.anim.rotateMs ?? 160);
      this.onRotate(tileId);
      this.onMove([]);
      this.#updateHover(this.lastPoint);
      return;
    }
    if (!isDragging) return;

    const { slideMs, returnMs } = this.config.anim;
    const targetCell = this.view.cellFromPoint(anchorX, anchorY);
    const moves = targetCell < 0 ? null : this.#planDrop(originCell, cells, targetCell);
    if (!moves) {
      for (const piece of pieces) this.view.slideToCell(piece.tileId, piece.cell, returnMs, true, 'back');
      // Off the board is a mistake worth a sound; dropping back where it came from is not.
      if (targetCell < 0) this.onInvalid();
      this.#updateHover(this.lastPoint);
      return;
    }

    this.board.applyMoves(moves);
    const groupSize = pieces.length;
    moves.forEach((move, i) => {
      const isHeld = i < groupSize;
      this.view.slideToCell(move.tileId, move.to, slideMs, isHeld, isHeld ? 'back' : 'cubic');
    });
    this.view.queueLanding(pieces.map((piece) => piece.tileId));
    this.onDrop(moves);
    this.onMove(moves);
  }

  /**
   * Decide where a drop lands: the grabbed tile goes to the target cell and
   * the group is pulled back so it stays on the board.
   * @returns {object[] | null} The moves to apply, or null to send the group home.
   */
  #planDrop(originCell, cells, targetCell) {
    const from = this.board.colRow(originCell);
    const to = this.board.colRow(targetCell);
    const { dCol, dRow } = clampGroupOffset(this.board, cells, to.col - from.col, to.row - from.row);
    return planGroupMove(this.board, cells, dCol, dRow);
  }
}
