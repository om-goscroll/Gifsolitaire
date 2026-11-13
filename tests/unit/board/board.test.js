import { describe, it, expect } from 'vitest';
import { Board, createRng } from '../../../src/core/board.js';
import { findGroups } from '../../../src/core/groups.js';

// Fixtures
const COLS = 3;
const ROWS = 3;
const BIG_COLS = 4;
const BIG_ROWS = 4;
const SEED = 12345;
const OTHER_SEED = 54321;
const MANY_SEEDS = 200;

const sorted = (cells) => [...cells].sort((a, b) => a - b);
const identity = (n) => Array.from({ length: n }, (_, i) => i);

describe('Board', () => {
  it('new is solved with every tile at home', () => {
    const board = new Board(COLS, ROWS);
    expect(board.size).toBe(COLS * ROWS);
    expect(board.isSolved()).toBe(true);
    expect(board.cells).toEqual(identity(COLS * ROWS));
  });

  it('cell index and col row round trip', () => {
    const board = new Board(BIG_COLS, BIG_ROWS);
    for (let cell = 0; cell < board.size; cell++) {
      const { col, row } = board.colRow(cell);
      expect(board.cellIndex(col, row)).toBe(cell);
    }
    expect(board.colRow(board.cellIndex(BIG_COLS - 1, BIG_ROWS - 1))).toEqual({
      col: BIG_COLS - 1,
      row: BIG_ROWS - 1,
    });
  });

  it('swap exchanges two tiles and leaves the rest', () => {
    const board = new Board(COLS, ROWS);
    const a = 0;
    const b = board.size - 1;
    expect(board.swap(a, b)).toBe(true);
    expect(board.tileAt(a)).toBe(b);
    expect(board.tileAt(b)).toBe(a);
    for (let cell = 1; cell < board.size - 1; cell++) expect(board.tileAt(cell)).toBe(cell);
    expect(board.isSolved()).toBe(false);
  });

  it('swap twice restores the arrangement', () => {
    const board = new Board(COLS, ROWS);
    board.swap(1, 5);
    board.swap(1, 5);
    expect(board.isSolved()).toBe(true);
  });

  it('swap rejects same cell and off board cells', () => {
    const board = new Board(COLS, ROWS);
    expect(board.swap(2, 2)).toBe(false);
    expect(board.swap(-1, 2)).toBe(false);
    expect(board.swap(2, board.size)).toBe(false);
    expect(board.isSolved()).toBe(true);
  });

  it('cell of is the inverse of tile at', () => {
    const board = new Board(BIG_COLS, BIG_ROWS);
    board.shuffle(createRng(SEED));
    for (let cell = 0; cell < board.size; cell++) {
      expect(board.cellOf(board.tileAt(cell))).toBe(cell);
    }
  });

  it('shuffle keeps every tile exactly once', () => {
    const board = new Board(BIG_COLS, BIG_ROWS);
    board.shuffle(createRng(SEED));
    expect(sorted(board.cells)).toEqual(identity(BIG_COLS * BIG_ROWS));
  });

  it('shuffle same seed gives same arrangement', () => {
    const first = new Board(COLS, ROWS);
    const second = new Board(COLS, ROWS);
    first.shuffle(createRng(SEED));
    second.shuffle(createRng(SEED));
    expect(first.cells).toEqual(second.cells);
  });

  it('shuffle different seed gives different arrangement', () => {
    const first = new Board(BIG_COLS, BIG_ROWS);
    const second = new Board(BIG_COLS, BIG_ROWS);
    first.shuffle(createRng(SEED));
    second.shuffle(createRng(OTHER_SEED));
    expect(first.cells).not.toEqual(second.cells);
  });

  it('shuffle never leaves the board solved', () => {
    for (let seed = 0; seed < MANY_SEEDS; seed++) {
      const board = new Board(2, 1);
      board.shuffle(createRng(seed));
      expect(board.isSolved()).toBe(false);
    }
  });

  it('shuffle never starts with any merged tiles across board sizes', () => {
    for (const [cols, rows] of [[2, 1], [2, 2], [3, 3], [4, 4]]) {
      for (let seed = 0; seed < MANY_SEEDS; seed++) {
        const board = new Board(cols, rows);
        board.shuffle(createRng(seed));
        expect(board.hasAnyJoins()).toBe(false);
        expect(findGroups(board).groups.length).toBe(cols * rows);
      }
    }
  });

  it('shuffle single cell board is left alone', () => {
    const board = new Board(1, 1);
    board.shuffle(createRng(SEED));
    expect(board.cells).toEqual([0]);
  });

  it('rotateTile increments clockwise quarter turns and wraps at 4', () => {
    const board = new Board(COLS, ROWS);
    expect(board.rotationOf(0)).toBe(0);
    expect(board.rotateTile(0)).toBe(1);
    expect(board.rotateTile(0)).toBe(2);
    expect(board.rotateTile(0)).toBe(3);
    expect(board.rotateTile(0)).toBe(0);
  });

  it('randomizeRotations sets every tile to 90, 180, or 270 degrees and blocks isSolved', () => {
    const board = new Board(COLS, ROWS);
    board.randomizeRotations(createRng(SEED));
    for (let id = 0; id < board.size; id++) {
      expect([1, 2, 3]).toContain(board.rotationOf(id));
    }
    expect(board.isSolved()).toBe(false);
  });
});

describe('createRng', () => {
  it('returns values in unit range', () => {
    const rng = createRng(SEED);
    for (let i = 0; i < MANY_SEEDS; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
