/**
 * Works out the most helpful next move for the Hint button. Pure logic: no
 * rendering, no DOM.
 *
 * On swap levels a hint moves one group (or single tile) straight to its home
 * cells. Tiles that are already home are never displaced by such a move,
 * because a group's home cells can only be occupied by tiles that are out of
 * place. So every hint puts at least one more tile home, and following hints
 * always finishes the puzzle in at most one hint per tile.
 *
 * On rotation (bonus) levels a hint names one tile to tap and how many times.
 */
import { Board } from './board.js';
import { findGroups, joinMasks, planGroupMove } from './groups.js';

/** A copy of a board that can be changed without touching the original. */
function cloneBoard(board) {
  const copy = new Board(board.cols, board.rows);
  copy.cells = board.cells.slice();
  copy.rotations = board.rotations.slice();
  return copy;
}

function bitCount(mask) {
  let n = 0;
  for (let m = mask; m; m >>= 1) n += m & 1;
  return n;
}

/**
 * How many joined neighbour pairs the board has.
 * @param {import('./board.js').Board} board
 * @returns {number}
 * @example countJoins(new Board(2, 2)) // 4
 */
export function countJoins(board) {
  let sides = 0;
  for (const mask of joinMasks(board)) sides += bitCount(mask);
  return sides / 2;
}

/**
 * How many tiles sit in their home cell, upright.
 * @param {import('./board.js').Board} board
 * @returns {number}
 * @example countHome(new Board(3, 3)) // 9
 */
export function countHome(board) {
  let n = 0;
  for (let cell = 0; cell < board.size; cell++) {
    const tileId = board.tileAt(cell);
    if (tileId === cell && board.rotationOf(tileId) === 0) n += 1;
  }
  return n;
}

/** Whether score a beats score b: more joins, then more tiles home, then bigger. */
function isBetter(a, b) {
  if (a.joins !== b.joins) return a.joins > b.joins;
  if (a.home !== b.home) return a.home > b.home;
  return a.size > b.size;
}

function bestMove(board) {
  const joinsBefore = countJoins(board);
  const homeBefore = countHome(board);
  let best = null;
  for (const cells of findGroups(board).groups) {
    const tileId = board.tileAt(cells[0]);
    if (board.rotationOf(tileId) !== 0) continue;
    const at = board.colRow(cells[0]);
    const home = board.colRow(tileId);
    const dCol = home.col - at.col;
    const dRow = home.row - at.row;
    const moves = planGroupMove(board, cells, dCol, dRow);
    if (!moves) continue;
    const after = cloneBoard(board);
    after.applyMoves(moves);
    const score = {
      joins: countJoins(after) - joinsBefore,
      home: countHome(after) - homeBefore,
      size: cells.length,
    };
    if (!best || isBetter(score, best.score)) {
      const offset = dRow * board.cols + dCol;
      best = {
        score,
        hint: {
          kind: 'move',
          cells: [...cells],
          tileIds: cells.map((cell) => board.tileAt(cell)),
          dCol,
          dRow,
          targetCells: cells.map((cell) => cell + offset),
          moves,
        },
      };
    }
  }
  return best?.hint ?? null;
}

function bestRotation(board) {
  const joinsBefore = countJoins(board);
  let best = null;
  for (let cell = 0; cell < board.size; cell++) {
    const tileId = board.tileAt(cell);
    const rotation = board.rotationOf(tileId);
    if (rotation === 0) continue;
    const after = cloneBoard(board);
    after.rotations[tileId] = 0;
    const score = { joins: countJoins(after) - joinsBefore, home: tileId === cell ? 1 : 0, size: 1 };
    if (!best || isBetter(score, best.score)) {
      best = { score, hint: { kind: 'rotate', cells: [cell], tileIds: [tileId], taps: (4 - rotation) % 4 } };
    }
  }
  return best?.hint ?? null;
}

/**
 * Keep a hint going after the board changes. A hint stays with its tile until
 * that tile has merged with a tile the hint was not about, or has reached the
 * place the hint pointed to (its home cell; for a rotate hint, upright). Until
 * then this re-aims the hint from wherever the tile is now, even if the player
 * moved it somewhere else.
 * @param {import('./board.js').Board} board The board now.
 * @param {object | null} hint A hint from findHint() or an earlier refreshHint().
 * @returns {object | null} The updated hint, or null once it has been followed.
 * @example activeHint = refreshHint(board, activeHint); // after every move
 */
export function refreshHint(board, hint) {
  if (!hint || board.isSolved()) return null;
  const anchor = hint.tileIds[0];
  const cell = board.cellOf(anchor);
  if (cell < 0) return null;

  if (hint.kind === 'rotate') {
    const rotation = board.rotationOf(anchor);
    if (rotation === 0) return null;
    return { kind: 'rotate', cells: [cell], tileIds: [anchor], taps: (4 - rotation) % 4 };
  }

  const { groupOf, groups } = findGroups(board);
  const cells = groups[groupOf[cell]];
  const tileIds = cells.map((groupCell) => board.tileAt(groupCell));
  // Merged: the tile's group now holds a tile the hint was not about.
  if (tileIds.some((id) => !hint.tileIds.includes(id))) return null;

  const at = board.colRow(cell);
  const home = board.colRow(anchor);
  const dCol = home.col - at.col;
  const dRow = home.row - at.row;
  // Reached the suggested place.
  if (dCol === 0 && dRow === 0) return null;
  const moves = planGroupMove(board, cells, dCol, dRow);
  if (!moves) return null;
  const offset = dRow * board.cols + dCol;
  return {
    kind: 'move',
    cells: [...cells],
    tileIds,
    dCol,
    dRow,
    targetCells: cells.map((groupCell) => groupCell + offset),
    moves,
  };
}

/**
 * The most helpful next move, or null when the puzzle is solved (or nothing
 * the player is allowed to do would help).
 * @param {import('./board.js').Board} board
 * @param {{allowDrag?: boolean, allowRotate?: boolean}} [rules] What the level lets the player do.
 * @returns {null | {kind: 'move', cells: number[], tileIds: number[], dCol: number, dRow: number,
 *   targetCells: number[], moves: object[]} | {kind: 'rotate', cells: number[], tileIds: number[], taps: number}}
 * @example
 * const hint = findHint(board, { allowDrag: true });
 * if (hint?.kind === 'move') board.applyMoves(hint.moves);
 */
export function findHint(board, { allowDrag = true, allowRotate = false } = {}) {
  if (board.isSolved()) return null;
  if (allowDrag) {
    const move = bestMove(board);
    if (move) return move;
  }
  if (allowRotate) return bestRotation(board);
  return null;
}
