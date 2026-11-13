import { describe, it, expect } from 'vitest';
import { Board } from '../../../src/core/board.js';
import { JOIN, areJoined, joinMasks, findGroups } from '../../../src/core/groups.js';

// Fixtures
const COLS = 3;
const ROWS = 3;

/** A 3x3 board with the given arrangement (cells[cell] = tile id). */
function boardWith(cells) {
  const board = new Board(COLS, ROWS);
  board.cells = [...cells];
  return board;
}

// Tiles 0 and 1 sit side by side in the right order at cells 3 and 4; nothing else matches.
const ONE_PAIR = [8, 7, 6, 0, 1, 5, 4, 2, 3];
// Tiles 0 and 1 are neighbours but the wrong way round.
const REVERSED_PAIR = [1, 0, 8, 7, 6, 2, 5, 4, 3];
// Top row solved (a 1x3 group); bottom two rows scrambled with no joins.
const TOP_ROW_SOLVED = [0, 1, 2, 8, 7, 6, 5, 4, 3];

describe('areJoined', () => {
  it('joins every side-by-side pair on a solved board', () => {
    const board = new Board(COLS, ROWS);

    expect(areJoined(board, 0, 1)).toBe(true);
    expect(areJoined(board, 1, 0)).toBe(true);
    expect(areJoined(board, 4, 7)).toBe(true);
    expect(areJoined(board, 7, 4)).toBe(true);
  });

  it('joins a correct pair that is away from its home cells', () => {
    const board = boardWith(ONE_PAIR);

    expect(areJoined(board, 3, 4)).toBe(true);
  });

  it('does not join neighbours that are the wrong way round', () => {
    const board = boardWith(REVERSED_PAIR);

    expect(areJoined(board, 0, 1)).toBe(false);
  });

  it('does not join cells that are diagonal, apart, the same, or off the board', () => {
    const board = new Board(COLS, ROWS);

    expect(areJoined(board, 0, 4)).toBe(false);
    expect(areJoined(board, 0, 2)).toBe(false);
    expect(areJoined(board, 3, 3)).toBe(false);
    expect(areJoined(board, 0, -1)).toBe(false);
    expect(areJoined(board, 8, 9)).toBe(false);
  });

  it('does not join the end of one row to the start of the next', () => {
    const board = new Board(COLS, ROWS);

    expect(areJoined(board, 2, 3)).toBe(false);
  });
});

describe('joinMasks', () => {
  it('flags every inner side on a solved board', () => {
    const masks = joinMasks(new Board(COLS, ROWS));

    expect(masks[0]).toBe(JOIN.RIGHT | JOIN.DOWN);
    expect(masks[4]).toBe(JOIN.LEFT | JOIN.RIGHT | JOIN.UP | JOIN.DOWN);
    expect(masks[8]).toBe(JOIN.LEFT | JOIN.UP);
  });

  it('flags only the two facing sides of a single joined pair', () => {
    const masks = joinMasks(boardWith(ONE_PAIR));

    expect(masks[3]).toBe(JOIN.RIGHT);
    expect(masks[4]).toBe(JOIN.LEFT);
    expect(masks.filter((m) => m !== 0)).toHaveLength(2);
  });

  it('treats the excluded cell as joined to nothing, on both sides', () => {
    const masks = joinMasks(new Board(COLS, ROWS), 4);

    expect(masks[4]).toBe(0);
    expect(masks[3]).toBe(JOIN.UP | JOIN.DOWN);
    expect(masks[1]).toBe(JOIN.LEFT | JOIN.RIGHT);
  });
});

describe('findGroups', () => {
  it('makes one group of the whole solved board', () => {
    const { groups, groupOf } = findGroups(new Board(COLS, ROWS));

    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(groupOf).size).toBe(1);
  });

  it('makes a group of one for every tile when nothing is joined', () => {
    const { groups } = findGroups(boardWith(REVERSED_PAIR));

    expect(groups).toHaveLength(COLS * ROWS);
  });

  it('finds a solved row as one group and leaves the rest single', () => {
    const { groups, groupOf } = findGroups(boardWith(TOP_ROW_SOLVED));

    expect(groups[groupOf[0]]).toEqual([0, 1, 2]);
    expect(groups).toHaveLength(1 + 6);
  });

  it('splits a group around the excluded cell', () => {
    const { groups, groupOf } = findGroups(boardWith(TOP_ROW_SOLVED), 1);

    expect(groups[groupOf[0]]).toEqual([0]);
    expect(groups[groupOf[1]]).toEqual([1]);
    expect(groups[groupOf[2]]).toEqual([2]);
  });

  it('puts every cell in exactly one group', () => {
    const { groups } = findGroups(boardWith(ONE_PAIR));

    expect(groups.flat().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('does not join adjacent tiles unless both are upright (0 degrees)', () => {
    const board = new Board(3, 3);
    board.rotateTile(1); // 90 deg
    expect(areJoined(board, 0, 1)).toBe(false);
    expect(areJoined(board, 1, 2)).toBe(false);
    expect(areJoined(board, 0, 3)).toBe(true);
  });
});
