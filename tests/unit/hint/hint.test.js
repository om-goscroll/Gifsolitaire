import { describe, it, expect } from 'vitest';
import { Board, createRng } from '../../../src/core/board.js';
import { findHint, refreshHint, countJoins, countHome } from '../../../src/core/hint.js';

// Fixtures
const COLS = 3;
const ROWS = 3;
const BIG = 4;
const SEEDS = 40;

/** A 3x3 board with the given arrangement (cells[cell] = tile id). */
function boardWith(cells, cols = COLS, rows = ROWS) {
  const board = new Board(cols, rows);
  board.cells = [...cells];
  return board;
}

// Solved except tiles 0 and 8, which have swapped places.
const CORNERS_SWAPPED = [8, 1, 2, 3, 4, 5, 6, 7, 0];
// The pairs 0-1 and 3-4 have swapped rows; every other tile is home.
const PAIRS_SWAPPED = [3, 4, 2, 0, 1, 5, 6, 7, 8];

describe('countJoins and countHome', () => {
  it('count every pair and every tile on a solved board', () => {
    const board = new Board(COLS, ROWS);

    expect(countJoins(board)).toBe(12);
    expect(countHome(board)).toBe(9);
  });

  it('do not count a rotated tile as home or joined', () => {
    const board = new Board(2, 1);
    board.rotateTile(0);

    expect(countHome(board)).toBe(1);
    expect(countJoins(board)).toBe(0);
  });
});

describe('findHint on swap levels', () => {
  it('returns null when the puzzle is solved', () => {
    expect(findHint(new Board(COLS, ROWS))).toBeNull();
  });

  it('moves an out-of-place tile to its home cell', () => {
    const board = boardWith(CORNERS_SWAPPED);

    const hint = findHint(board);

    expect(hint.kind).toBe('move');
    expect(hint.cells).toHaveLength(1);
    expect(hint.targetCells[0]).toBe(hint.tileIds[0]);
  });

  it('solves a one-swap puzzle when its moves are applied', () => {
    const board = boardWith(CORNERS_SWAPPED);

    board.applyMoves(findHint(board).moves);

    expect(board.isSolved()).toBe(true);
  });

  it('moves a whole joined group to its home cells', () => {
    const board = boardWith(PAIRS_SWAPPED);

    const hint = findHint(board);

    expect(hint.cells).toHaveLength(2);
    expect(hint.targetCells).toEqual(hint.tileIds);
    expect(Math.abs(hint.dRow)).toBe(1);
    expect(hint.dCol).toBe(0);
  });

  it('solves the swapped pairs in one move', () => {
    const board = boardWith(PAIRS_SWAPPED);

    board.applyMoves(findHint(board).moves);

    expect(board.isSolved()).toBe(true);
  });

  it('never displaces a tile that is already home, and always solves the puzzle', () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const board = new Board(BIG, BIG);
      board.shuffle(createRng(seed));
      let hints = 0;

      while (!board.isSolved()) {
        const homeBefore = board.cells.map((tileId, cell) => tileId === cell);
        board.applyMoves(findHint(board).moves);
        hints += 1;

        homeBefore.forEach((wasHome, cell) => {
          if (wasHome) expect(board.tileAt(cell)).toBe(cell);
        });
        expect(hints).toBeLessThanOrEqual(BIG * BIG);
      }
    }
  });

  it('gives nothing to move when dragging is not allowed and nothing is rotated', () => {
    const board = boardWith(CORNERS_SWAPPED);

    expect(findHint(board, { allowDrag: false, allowRotate: true })).toBeNull();
  });
});

describe('findHint on rotation levels', () => {
  it('names a rotated tile and the taps that make it upright', () => {
    const board = new Board(COLS, ROWS);
    board.rotations[4] = 3;

    const hint = findHint(board, { allowDrag: false, allowRotate: true });

    expect(hint).toEqual({ kind: 'rotate', cells: [4], tileIds: [4], taps: 1 });
  });

  it('prefers the tile whose fix joins the most neighbours', () => {
    const board = new Board(COLS, ROWS);
    board.rotations = [2, 2, 2, 2, 1, 2, 2, 2, 2];
    board.rotations[0] = 0;
    board.rotations[1] = 0;
    // Cell 2 sits next to upright cell 1; cell 8 has no upright neighbour.

    const hint = findHint(board, { allowDrag: false, allowRotate: true });

    expect([2, 3]).toContain(hint.cells[0]);
  });

  it('solves a rotation puzzle when its taps are followed', () => {
    const board = new Board(COLS, ROWS);
    board.randomizeRotations(createRng(7));

    let guard = 0;
    while (!board.isSolved() && guard++ < board.size) {
      const hint = findHint(board, { allowDrag: false, allowRotate: true });
      for (let i = 0; i < hint.taps; i++) board.rotateTile(hint.tileIds[0]);
    }

    expect(board.isSolved()).toBe(true);
  });
});

describe('refreshHint', () => {
  // Tile 0 sits alone in the centre (cell 4); nothing is joined to it.
  const TILE_0_IN_CENTRE = [8, 7, 6, 5, 0, 3, 2, 1, 4];
  const hintForTile0 = (board) => refreshHint(board, { kind: 'move', tileIds: [0], cells: [board.cellOf(0)] });

  it('keeps pointing at the same place while nothing has changed', () => {
    const board = boardWith(TILE_0_IN_CENTRE);

    const hint = hintForTile0(board);

    expect(hint).toMatchObject({ kind: 'move', tileIds: [0], cells: [4], targetCells: [0], dCol: -1, dRow: -1 });
  });

  it('follows the tile when it was moved somewhere else', () => {
    const board = boardWith(TILE_0_IN_CENTRE);
    const before = hintForTile0(board);
    board.swap(4, 8);

    const after = refreshHint(board, before);

    expect(after).toMatchObject({ cells: [8], targetCells: [0], dCol: -2, dRow: -2 });
  });

  it('stays active after an unrelated move elsewhere on the board', () => {
    const board = boardWith(TILE_0_IN_CENTRE);
    const before = hintForTile0(board);
    board.swap(6, 2);

    expect(refreshHint(board, before)).toMatchObject({ cells: [4], targetCells: [0] });
  });

  it('ends once the tile reaches the suggested place', () => {
    const board = boardWith(TILE_0_IN_CENTRE);
    const hint = hintForTile0(board);

    board.applyMoves(hint.moves);

    expect(board.tileAt(0)).toBe(0);
    expect(refreshHint(board, hint)).toBeNull();
  });

  it('ends once the tile merges with another tile', () => {
    const board = boardWith(TILE_0_IN_CENTRE);
    const hint = hintForTile0(board);

    board.swap(5, 7); // tile 1 lands right of tile 0, where it belongs relative to it

    expect(refreshHint(board, hint)).toBeNull();
  });

  it('keeps a rotate hint until the tile is upright, counting the taps left', () => {
    const board = new Board(COLS, ROWS);
    board.rotations[4] = 1;
    const hint = findHint(board, { allowDrag: false, allowRotate: true });
    expect(hint.taps).toBe(3);

    board.rotateTile(4);
    const after = refreshHint(board, hint);
    expect(after).toMatchObject({ kind: 'rotate', tileIds: [4], taps: 2 });

    board.rotateTile(4);
    board.rotateTile(4);
    expect(refreshHint(board, after)).toBeNull();
  });

  it('gives nothing for no hint or a solved board', () => {
    expect(refreshHint(boardWith(TILE_0_IN_CENTRE), null)).toBeNull();
    expect(refreshHint(new Board(COLS, ROWS), { kind: 'move', tileIds: [0], cells: [0] })).toBeNull();
  });
});
