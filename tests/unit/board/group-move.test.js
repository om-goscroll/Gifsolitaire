import { describe, it, expect } from 'vitest';
import { Board, createRng } from '../../../src/core/board.js';
import { clampGroupOffset, planGroupMove } from '../../../src/core/groups.js';

// Fixtures
const COLS = 3;
const ROWS = 3;
const BIG = 4;
const SEED = 2024;
const identity = (n) => Array.from({ length: n }, (_, i) => i);
const sorted = (cells) => [...cells].sort((a, b) => a - b);

/** Where each tile ends up, as { tileId: toCell }. */
const destinations = (moves) => Object.fromEntries(moves.map((m) => [m.tileId, m.to]));

describe('clampGroupOffset', () => {
  it('leaves a move alone when the group stays on the board', () => {
    const board = new Board(COLS, ROWS);

    expect(clampGroupOffset(board, [0, 1], 1, 2)).toEqual({ dCol: 1, dRow: 2 });
  });

  it('pulls a move back so the group stops at the board edge', () => {
    const board = new Board(COLS, ROWS);

    expect(clampGroupOffset(board, [1, 2], 2, 0)).toEqual({ dCol: 0, dRow: 0 });
    expect(clampGroupOffset(board, [0, 1], 5, 5)).toEqual({ dCol: 1, dRow: 2 });
    expect(clampGroupOffset(board, [4, 5, 7, 8], -3, -3)).toEqual({ dCol: -1, dRow: -1 });
  });
});

describe('planGroupMove', () => {
  it('swaps two tiles when a single tile moves', () => {
    const board = new Board(COLS, ROWS);

    const moves = planGroupMove(board, [0], 2, 2);

    expect(moves).toEqual([
      { tileId: 0, from: 0, to: 8 },
      { tileId: 8, from: 8, to: 0 },
    ]);
  });

  it('returns null for a zero move', () => {
    expect(planGroupMove(new Board(COLS, ROWS), [0, 1], 0, 0)).toBeNull();
  });

  it('returns null when any part of the group would leave the board', () => {
    const board = new Board(COLS, ROWS);

    expect(planGroupMove(board, [0, 1], 2, 0)).toBeNull();
    expect(planGroupMove(board, [0, 3], 0, -1)).toBeNull();
    expect(planGroupMove(board, [6, 7], 0, 1)).toBeNull();
  });

  it('sends the tiles a block lands on into the cells the block left', () => {
    const board = new Board(COLS, ROWS);
    const block = [3, 4, 6, 7];

    const to = destinations(planGroupMove(board, block, 0, -1));

    // The block moves up one row...
    expect([to[3], to[4], to[6], to[7]]).toEqual([0, 1, 3, 4]);
    // ...and the two tiles above it drop to the bottom row, in the same columns.
    expect([to[0], to[1]]).toEqual([6, 7]);
  });

  it('carries a displaced tile past the whole group when the move overlaps it', () => {
    const board = new Board(COLS, ROWS);

    const to = destinations(planGroupMove(board, [0, 1], 1, 0));

    expect([to[0], to[1]]).toEqual([1, 2]);
    expect(to[2]).toBe(0);
  });

  it('moves a column sideways and returns the displaced column in order', () => {
    const board = new Board(COLS, ROWS);

    const to = destinations(planGroupMove(board, [0, 3], 2, 0));

    expect([to[0], to[3]]).toEqual([2, 5]);
    expect([to[2], to[5]]).toEqual([0, 3]);
  });

  it('handles an L-shaped group moving diagonally', () => {
    const board = new Board(BIG, BIG);
    const lShape = [0, 4, 5];

    const moves = planGroupMove(board, lShape, 1, 1);
    const to = destinations(moves);

    expect([to[0], to[4], to[5]]).toEqual([5, 9, 10]);
    // Cells 9 and 10 are entered; cells 0 and 4 are left.
    expect(sorted([to[9], to[10]])).toEqual([0, 4]);
    expect(moves).toHaveLength(5);
  });

  it('keeps every tile exactly once after the move is applied', () => {
    const board = new Board(BIG, BIG);
    board.shuffle(createRng(SEED));

    board.applyMoves(planGroupMove(board, [5, 6, 9], 1, -1));

    expect(sorted(board.cells)).toEqual(identity(BIG * BIG));
  });

  it('keeps the group in the same shape after the move is applied', () => {
    const board = new Board(COLS, ROWS);
    const block = [3, 4, 6, 7];
    const tiles = block.map((cell) => board.tileAt(cell));

    board.applyMoves(planGroupMove(board, block, 1, -1));

    expect(tiles.map((tileId) => board.cellOf(tileId))).toEqual([1, 2, 4, 5]);
  });

  it('leaves tiles outside the move untouched', () => {
    const board = new Board(COLS, ROWS);

    board.applyMoves(planGroupMove(board, [0, 1], 0, 1));

    expect(board.tileAt(2)).toBe(2);
    expect(board.tileAt(5)).toBe(5);
    expect(board.cells.slice(6)).toEqual([6, 7, 8]);
  });
});
