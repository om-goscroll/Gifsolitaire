import { describe, it, expect } from 'vitest';
import { Board } from '../../../src/core/board.js';
import { GameSession } from '../../../src/core/session.js';

// Fixtures
const COLS = 3;
const ROWS = 3;

/** A board one swap away from solved. */
function almostSolvedBoard() {
  const board = new Board(COLS, ROWS);
  board.swap(0, 1);
  return board;
}

describe('GameSession', () => {
  it('starts in play with no moves', () => {
    const session = new GameSession();

    expect(session.state).toBe('playing');
    expect(session.isWon).toBe(false);
    expect(session.moves).toBe(0);
  });

  it('counts a move and stays in play while the board is unsolved', () => {
    const session = new GameSession();
    const board = almostSolvedBoard();

    const justWon = session.recordMove(board);

    expect(justWon).toBe(false);
    expect(session.isWon).toBe(false);
    expect(session.moves).toBe(1);
  });

  it('reports the win on the move that solves the board', () => {
    const session = new GameSession();
    const board = almostSolvedBoard();
    session.recordMove(board);
    board.swap(0, 1);

    const justWon = session.recordMove(board);

    expect(justWon).toBe(true);
    expect(session.isWon).toBe(true);
    expect(session.moves).toBe(2);
  });

  it('reports the win only once and stops counting moves after it', () => {
    const session = new GameSession();
    const board = new Board(COLS, ROWS);
    session.recordMove(board);

    const again = session.recordMove(board);

    expect(again).toBe(false);
    expect(session.isWon).toBe(true);
    expect(session.moves).toBe(1);
  });
});
