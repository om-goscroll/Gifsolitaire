import { describe, it, expect } from 'vitest';
import { Board } from '../../../src/core/board.js';
import { groupSignatures, findNewGroups, planGroupMove } from '../../../src/core/groups.js';

// Fixtures
const COLS = 3;
const ROWS = 3;

/** A 3x3 board with the given arrangement (cells[cell] = tile id). */
function boardWith(cells) {
  const board = new Board(COLS, ROWS);
  board.cells = [...cells];
  return board;
}

// Nothing is joined.
const NO_JOINS = [1, 0, 8, 7, 6, 2, 5, 4, 3];
// Tiles 0 and 1 are joined at cells 3 and 4; nothing else is.
const ONE_PAIR = [8, 7, 6, 0, 1, 5, 4, 2, 3];
// Tiles 0 and 1 are joined at cells 0 and 1; tile 2 sits at cell 8, one swap from joining them.
const PAIR_PLUS_LOOSE_TILE = [0, 1, 8, 7, 6, 3, 5, 4, 2];

describe('groupSignatures', () => {
  it('is empty when nothing is joined', () => {
    expect(groupSignatures(boardWith(NO_JOINS)).size).toBe(0);
  });

  it('lists a merged group by its tile ids in order', () => {
    expect([...groupSignatures(boardWith(ONE_PAIR))]).toEqual(['0,1']);
  });

  it('gives one signature for a solved board', () => {
    expect([...groupSignatures(new Board(COLS, ROWS))]).toEqual(['0,1,2,3,4,5,6,7,8']);
  });
});

describe('findNewGroups', () => {
  it('finds nothing when the board has not changed', () => {
    const board = boardWith(ONE_PAIR);

    expect(findNewGroups(board, groupSignatures(board))).toEqual([]);
  });

  it('finds a pair that has just formed', () => {
    const board = boardWith(NO_JOINS);
    const before = groupSignatures(board);

    board.swap(0, 1);

    expect(findNewGroups(board, before)).toEqual([[0, 1]]);
  });

  it('reports a group that grew as one new group of the larger size', () => {
    const board = boardWith(PAIR_PLUS_LOOSE_TILE);
    const before = groupSignatures(board);

    board.swap(2, 8);

    expect(findNewGroups(board, before)).toEqual([[0, 1, 2]]);
  });

  it('does not report a group that only moved', () => {
    const board = boardWith(ONE_PAIR);
    const before = groupSignatures(board);

    board.applyMoves(planGroupMove(board, [3, 4], 0, 1));

    expect(groupSignatures(board).has('0,1')).toBe(true);
    expect(findNewGroups(board, before)).toEqual([]);
  });

  it('ignores single tiles', () => {
    const board = boardWith(NO_JOINS);

    expect(findNewGroups(board, new Set())).toEqual([]);
  });
});
