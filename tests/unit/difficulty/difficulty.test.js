import { describe, it, expect } from 'vitest';
import { levelPlan, applyDifficulty, difficultyScore, checkDifficultySequence } from '../../../src/core/difficulty.js';
import { CONFIG } from '../../../src/config.js';

// Fixtures: a small curve with blocks of 4.
const CURVE = {
  blockSize: 4,
  pattern: ['normal', 'bonus', 'normal', 'hard'],
  blocks: [
    { normal: 3, hard: 4, bonus: 3 },
    { normal: 4, hard: 5, bonus: 4 },
  ],
};
const picture = (id) => ({ id, mediaSrc: `${id}.gif` });
const level = (type, size, id = type) => ({ id, type, cols: size, rows: size });

describe('levelPlan', () => {
  it('follows the pattern inside a block', () => {
    expect(levelPlan(0, CURVE)).toEqual({ type: 'normal', size: 3, block: 0 });
    expect(levelPlan(1, CURVE)).toEqual({ type: 'bonus', size: 3, block: 0 });
    expect(levelPlan(3, CURVE)).toEqual({ type: 'hard', size: 4, block: 0 });
  });

  it('steps the sizes up in the next block', () => {
    expect(levelPlan(4, CURVE)).toEqual({ type: 'normal', size: 4, block: 1 });
    expect(levelPlan(7, CURVE)).toEqual({ type: 'hard', size: 5, block: 1 });
  });

  it('keeps the last block sizes for levels past the end of the curve', () => {
    expect(levelPlan(12, CURVE)).toEqual({ type: 'normal', size: 4, block: 3 });
  });
});

describe('applyDifficulty', () => {
  it('gives every level its type and square grid from the curve', () => {
    const levels = applyDifficulty([picture('a'), picture('b'), picture('c'), picture('d')], CURVE);

    expect(levels.map((l) => [l.type, l.cols, l.rows])).toEqual([
      ['normal', 3, 3],
      ['bonus', 3, 3],
      ['normal', 3, 3],
      ['hard', 4, 4],
    ]);
  });

  it('keeps a grid or type a level sets itself', () => {
    const [first] = applyDifficulty([{ ...picture('a'), cols: 2, rows: 2 }], CURVE);

    expect(first).toMatchObject({ type: 'normal', cols: 2, rows: 2 });
  });
});

describe('difficultyScore', () => {
  it('counts tiles, with rotate levels at half', () => {
    expect(difficultyScore(level('normal', 4))).toBe(16);
    expect(difficultyScore(level('bonus', 4))).toBe(8);
  });
});

describe('checkDifficultySequence', () => {
  it('accepts a list built from the curve', () => {
    const levels = applyDifficulty(Array.from({ length: 12 }, (_, i) => picture(`p${i}`)), CURVE);

    expect(checkDifficultySequence(levels)).toEqual([]);
  });

  it('flags a normal level smaller than an earlier one', () => {
    const problems = checkDifficultySequence([level('normal', 4), level('normal', 3)]);

    expect(problems).toHaveLength(1);
  });

  it('flags a hard level smaller than the normal level before it', () => {
    expect(checkDifficultySequence([level('normal', 4), level('hard', 3)]).length).toBeGreaterThan(0);
  });

  it('flags a bonus level harder than the normal level before it', () => {
    expect(checkDifficultySequence([level('normal', 3), level('bonus', 5)])).toHaveLength(1);
  });
});

describe('the game\'s own levels', () => {
  const levels = applyDifficulty(CONFIG.levels, CONFIG.difficulty);

  it('follow the difficulty sequence', () => {
    expect(checkDifficultySequence(levels)).toEqual([]);
  });

  it('never get easier from one block to the next', () => {
    const { blockSize } = CONFIG.difficulty;
    const blockAverage = (b) => {
      const block = levels.slice(b * blockSize, (b + 1) * blockSize);
      return block.reduce((sum, l) => sum + difficultyScore(l), 0) / block.length;
    };
    const blocks = Math.ceil(levels.length / blockSize);
    for (let b = 1; b < blocks; b++) expect(blockAverage(b)).toBeGreaterThan(blockAverage(b - 1));
  });

  it('use every picture once', () => {
    const pictures = CONFIG.levels.map((l) => l.mediaSrc);

    expect(new Set(pictures).size).toBe(pictures.length);
  });
});
