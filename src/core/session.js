/**
 * Tracks one play of one puzzle: how many moves were made and whether it has
 * been won. Pure state, no rendering and no clock.
 *
 * @example
 * const session = new GameSession();
 * if (session.recordMove(board)) startWinSequence();
 */
export class GameSession {
  constructor() {
    /** 'playing' until the board is solved, then 'won'. */
    this.state = 'playing';
    /** Number of completed moves. */
    this.moves = 0;
  }

  /** True once the puzzle has been solved. */
  get isWon() {
    return this.state === 'won';
  }

  /**
   * Record a completed move and check for the win.
   * @param {import('./board.js').Board} board The board after the move.
   * @returns {boolean} true exactly once: on the move that solves the puzzle.
   * @example
   * board.applyMoves(moves);
   * const justWon = session.recordMove(board);
   */
  recordMove(board) {
    if (this.state !== 'playing') return false;
    this.moves += 1;
    if (!board.isSolved()) return false;
    this.state = 'won';
    return true;
  }
}
