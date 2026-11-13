/**
 * Pure board state for the picture swap puzzle. No rendering, no DOM, no clock:
 * everything here can be unit-tested directly.
 *
 * A "cell" is a position on the board, numbered row by row from the top-left.
 * A "tile" is a piece of the picture, identified by the cell it belongs in when
 * the puzzle is solved (its home cell).
 */

/**
 * Create a seeded pseudo-random number generator (mulberry32).
 * @param {number} seed Any integer.
 * @returns {() => number} A function returning a float in [0, 1).
 */
export function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The arrangement of tiles on the board. */
export class Board {
  /**
   * Create a solved board.
   * @param {number} cols Tiles across.
   * @param {number} rows Tiles down.
   */
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    /** cells[cell] = id of the tile currently in that cell. */
    this.cells = Array.from({ length: cols * rows }, (_, i) => i);
    /** rotations[tileId] = clockwise quarter-turns (0 = 0°, 1 = 90°, 2 = 180°, 3 = 270°). */
    this.rotations = new Array(cols * rows).fill(0);
  }

  /** Total number of cells (and tiles). */
  get size() {
    return this.cols * this.rows;
  }

  /**
   * Cell index for a column and row.
   * @param {number} col 0 at the left.
   * @param {number} row 0 at the top.
   */
  cellIndex(col, row) {
    return row * this.cols + col;
  }

  /**
   * Column and row of a cell.
   * @param {number} cell
   * @returns {{col: number, row: number}}
   */
  colRow(cell) {
    return { col: cell % this.cols, row: Math.floor(cell / this.cols) };
  }

  /** Whether a cell index is on the board. */
  isValidCell(cell) {
    return Number.isInteger(cell) && cell >= 0 && cell < this.size;
  }

  /** Id of the tile in a cell. */
  tileAt(cell) {
    return this.cells[cell];
  }

  /** Cell a tile is currently in. */
  cellOf(tileId) {
    return this.cells.indexOf(tileId);
  }

  /** Clockwise quarter-turns of a tile (0, 1, 2, or 3). */
  rotationOf(tileId) {
    return this.rotations[tileId] ?? 0;
  }

  /** Rotate a tile 90° clockwise and return its new quarter-turn count. */
  rotateTile(tileId) {
    const next = ((this.rotations[tileId] ?? 0) + 1) % 4;
    this.rotations[tileId] = next;
    return next;
  }

  /**
   * Give every tile a random non-zero rotation (90°, 180°, or 270°).
   * Used by Bonus Levels so every 1x1 tile starts unmerged and rotated.
   * @param {() => number} rng Returns a float in [0, 1).
   */
  randomizeRotations(rng) {
    for (let tileId = 0; tileId < this.size; tileId++) {
      this.rotations[tileId] = 1 + Math.floor(rng() * 3);
    }
  }

  /**
   * Exchange the tiles in two cells.
   * @returns {boolean} false (and no change) if either cell is invalid or they are the same cell.
   */
  swap(cellA, cellB) {
    if (!this.isValidCell(cellA) || !this.isValidCell(cellB) || cellA === cellB) return false;
    const held = this.cells[cellA];
    this.cells[cellA] = this.cells[cellB];
    this.cells[cellB] = held;
    return true;
  }

  /**
   * Move several tiles at once. The moves must fill exactly the cells they
   * empty (as planGroupMove produces), so every tile still appears once.
   * @param {{tileId: number, to: number}[]} moves
   * @example board.applyMoves(planGroupMove(board, [0, 1], 0, 1));
   */
  applyMoves(moves) {
    const next = this.cells.slice();
    for (const move of moves) next[move.to] = move.tileId;
    this.cells = next;
  }

  /** True when every tile is in its home cell and upright (0°). */
  isSolved() {
    return (
      this.cells.every((tileId, cell) => tileId === cell) &&
      this.rotations.every((r) => r === 0)
    );
  }

  /** True when any two neighbouring tiles sit in their solved relative positions. */
  hasAnyJoins() {
    for (let cell = 0; cell < this.size; cell++) {
      const { col, row } = this.colRow(cell);
      const home = this.colRow(this.cells[cell]);
      if (col < this.cols - 1) {
        const rightHome = this.colRow(this.cells[cell + 1]);
        if (rightHome.col === home.col + 1 && rightHome.row === home.row) return true;
      }
      if (row < this.rows - 1) {
        const downHome = this.colRow(this.cells[cell + this.cols]);
        if (downHome.col === home.col && downHome.row === home.row + 1) return true;
      }
    }
    return false;
  }

  /**
   * Shuffle the tiles in place (Fisher-Yates). The result is never the solved
   * arrangement and never starts with any merged/joined tiles, unless the board
   * has a single cell.
   * @param {() => number} rng Returns a float in [0, 1). Injected so tests are repeatable.
   */
  shuffle(rng) {
    if (this.size < 2) return;
    const maxAttempts = 1000;
    let attempts = 0;
    do {
      for (let i = this.size - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const held = this.cells[i];
        this.cells[i] = this.cells[j];
        this.cells[j] = held;
      }
      attempts += 1;
    } while ((this.isSolved() || this.hasAnyJoins()) && attempts < maxAttempts);
  }
}
