/**
 * Pure merge rules for the picture swap puzzle. Two tiles are "joined" when
 * they sit next to each other on the board in the same way they sit next to
 * each other in the finished picture. Joined tiles form groups.
 *
 * Groups are derived from the board every time they are needed; nothing here
 * stores state, so a group can never disagree with the board.
 */

/** Bit flags saying which sides of a cell are joined to a neighbour. */
export const JOIN = Object.freeze({ LEFT: 1, RIGHT: 2, UP: 4, DOWN: 8 });

/**
 * Whether the tiles in two cells are joined.
 * @param {import('./board.js').Board} board
 * @param {number} cellA
 * @param {number} cellB
 * @returns {boolean} true only for side-by-side cells whose tiles are side by
 *   side, in the same direction, in the finished picture.
 * @example areJoined(new Board(3, 3), 0, 1) // true: a solved board joins everywhere
 */
export function areJoined(board, cellA, cellB) {
  if (!board.isValidCell(cellA) || !board.isValidCell(cellB)) return false;
  const a = board.colRow(cellA);
  const b = board.colRow(cellB);
  const dCol = b.col - a.col;
  const dRow = b.row - a.row;
  if (Math.abs(dCol) + Math.abs(dRow) !== 1) return false;
  const tileA = board.tileAt(cellA);
  const tileB = board.tileAt(cellB);
  if (board.rotationOf(tileA) !== 0 || board.rotationOf(tileB) !== 0) return false;
  const homeA = board.colRow(tileA);
  const homeB = board.colRow(tileB);
  return homeB.col - homeA.col === dCol && homeB.row - homeA.row === dRow;
}

/**
 * For every cell, which of its sides are joined to a neighbour.
 * @param {import('./board.js').Board} board
 * @param {number} [excludedCell] A cell to treat as joined to nothing (the
 *   tile being held). -1 for none.
 * @returns {number[]} masks[cell] = a combination of JOIN flags.
 * @example joinMasks(new Board(2, 1)) // [JOIN.RIGHT, JOIN.LEFT]
 */
export function joinMasks(board, excludedCell = -1) {
  const masks = new Array(board.size).fill(0);
  for (let cell = 0; cell < board.size; cell++) {
    if (cell === excludedCell) continue;
    const { col, row } = board.colRow(cell);
    if (col < board.cols - 1) {
      const right = cell + 1;
      if (right !== excludedCell && areJoined(board, cell, right)) {
        masks[cell] |= JOIN.RIGHT;
        masks[right] |= JOIN.LEFT;
      }
    }
    if (row < board.rows - 1) {
      const down = cell + board.cols;
      if (down !== excludedCell && areJoined(board, cell, down)) {
        masks[cell] |= JOIN.DOWN;
        masks[down] |= JOIN.UP;
      }
    }
  }
  return masks;
}

/**
 * Split the board into groups of joined tiles. A tile joined to nothing is a
 * group of one.
 * @param {import('./board.js').Board} board
 * @param {number} [excludedCell] A cell to treat as joined to nothing. -1 for none.
 * @returns {{groupOf: number[], groups: number[][]}} groupOf[cell] = group id;
 *   groups[id] = that group's cells in ascending order.
 * @example findGroups(new Board(3, 3)).groups.length // 1: solved = one group
 */
export function findGroups(board, excludedCell = -1) {
  const masks = joinMasks(board, excludedCell);
  const groupOf = new Array(board.size).fill(-1);
  const groups = [];
  for (let start = 0; start < board.size; start++) {
    if (groupOf[start] !== -1) continue;
    const id = groups.length;
    const cells = [];
    const pending = [start];
    groupOf[start] = id;
    while (pending.length > 0) {
      const cell = pending.pop();
      cells.push(cell);
      const mask = masks[cell];
      const neighbours = [
        mask & JOIN.LEFT ? cell - 1 : -1,
        mask & JOIN.RIGHT ? cell + 1 : -1,
        mask & JOIN.UP ? cell - board.cols : -1,
        mask & JOIN.DOWN ? cell + board.cols : -1,
      ];
      for (const next of neighbours) {
        if (next !== -1 && groupOf[next] === -1) {
          groupOf[next] = id;
          pending.push(next);
        }
      }
    }
    groups.push(cells.sort((x, y) => x - y));
  }
  return { groupOf, groups };
}

/**
 * Pull a group's move back so the whole group stays on the board.
 * @param {import('./board.js').Board} board
 * @param {number[]} cells The group's cells.
 * @param {number} dCol Columns to move (right is positive).
 * @param {number} dRow Rows to move (down is positive).
 * @returns {{dCol: number, dRow: number}} The nearest move that fits.
 * @example clampGroupOffset(new Board(3, 3), [1, 2], 2, 0) // { dCol: 0, dRow: 0 }
 */
export function clampGroupOffset(board, cells, dCol, dRow) {
  let minCol = board.cols;
  let maxCol = -1;
  let minRow = board.rows;
  let maxRow = -1;
  for (const cell of cells) {
    const { col, row } = board.colRow(cell);
    minCol = Math.min(minCol, col);
    maxCol = Math.max(maxCol, col);
    minRow = Math.min(minRow, row);
    maxRow = Math.max(maxRow, row);
  }
  return {
    dCol: Math.max(-minCol, Math.min(board.cols - 1 - maxCol, dCol)),
    dRow: Math.max(-minRow, Math.min(board.rows - 1 - maxRow, dRow)),
  };
}

/**
 * Work out what happens when a group is dropped a number of cells away. The
 * group keeps its shape. Each tile it lands on steps back along the line of
 * the move, past the group, into a cell the group left empty. For one tile
 * this is a plain swap.
 * @param {import('./board.js').Board} board
 * @param {number[]} cells The group's cells.
 * @param {number} dCol Columns to move (right is positive).
 * @param {number} dRow Rows to move (down is positive).
 * @returns {{tileId: number, from: number, to: number}[] | null} Every tile
 *   that moves, group tiles first. null when the move is zero or would take
 *   any part of the group off the board. Pass the result to board.applyMoves.
 * @example planGroupMove(new Board(3, 3), [0], 1, 0)
 * // [{ tileId: 0, from: 0, to: 1 }, { tileId: 1, from: 1, to: 0 }]
 */
export function planGroupMove(board, cells, dCol, dRow) {
  if (dCol === 0 && dRow === 0) return null;
  for (const cell of cells) {
    const { col, row } = board.colRow(cell);
    const toCol = col + dCol;
    const toRow = row + dRow;
    if (toCol < 0 || toCol >= board.cols || toRow < 0 || toRow >= board.rows) return null;
  }
  const offset = dRow * board.cols + dCol;
  const targets = new Set(cells.map((cell) => cell + offset));
  const inGroup = new Set(cells);
  const moves = cells.map((cell) => ({ tileId: board.tileAt(cell), from: cell, to: cell + offset }));
  for (const landed of targets) {
    if (inGroup.has(landed)) continue;
    let to = landed - offset;
    while (targets.has(to)) to -= offset;
    moves.push({ tileId: board.tileAt(landed), from: landed, to });
  }
  return moves;
}

/**
 * A fingerprint for every merged group (two or more tiles) on the board: the
 * group's tile ids in ascending order. It stays the same when a group is moved
 * and changes when a group gains or loses a tile.
 * @param {import('./board.js').Board} board
 * @returns {Set<string>}
 * @example groupSignatures(new Board(2, 1)) // Set { '0,1' }
 */
export function groupSignatures(board) {
  const signatures = new Set();
  for (const cells of findGroups(board).groups) {
    if (cells.length > 1) signatures.add(signatureOf(board, cells));
  }
  return signatures;
}

/**
 * The merged groups that were not on the board before: groups that have just
 * formed or just grown. A group that only moved is not new.
 * @param {import('./board.js').Board} board The board now.
 * @param {Set<string>} previousSignatures groupSignatures(board) from before the move.
 * @returns {number[][]} The cells of each new group.
 * @example
 * const before = groupSignatures(board);
 * board.applyMoves(moves);
 * for (const cells of findNewGroups(board, before)) effects.mergeFlash(cells, masks);
 */
export function findNewGroups(board, previousSignatures) {
  return findGroups(board).groups.filter(
    (cells) => cells.length > 1 && !previousSignatures.has(signatureOf(board, cells)),
  );
}

function signatureOf(board, cells) {
  return cells
    .map((cell) => board.tileAt(cell))
    .sort((a, b) => a - b)
    .join(',');
}
