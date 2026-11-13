import { describe, it, expect } from 'vitest';
import { normalizeLevels, bannerFor, validateLevels } from '../../../src/core/levels.js';

// Fixtures
const MIN_GRID = 2;
const MEDIA = ['a.gif', 'b.gif', 'c.jpg'];
const BANNER = { labels: { hard: 'Hard Level', bonus: 'Bonus Level' } };
const LEVELS = [
  { id: 'l1', mediaSrc: 'a.gif', cols: 3, rows: 3, type: 'normal' },
  { id: 'l2', mediaSrc: 'b.gif', cols: 3, rows: 3, type: 'bonus' },
  { id: 'l3', mediaSrc: 'c.jpg', cols: 4, rows: 4, type: 'hard' },
];

/** A valid level with some fields replaced. */
const levelWith = (changes) => ({ id: 'x1', mediaSrc: 'a.gif', cols: 3, rows: 3, type: 'normal', ...changes });

describe('normalizeLevels', () => {
  it('keeps every level in play order', () => {
    expect(normalizeLevels(LEVELS).map((level) => level.id)).toEqual(['l1', 'l2', 'l3']);
  });

  it('numbers the levels in one continuous run from 1', () => {
    const levels = normalizeLevels(LEVELS);

    expect(levels.map((l) => [l.index, l.number])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
  });

  it('marks bonus levels and keeps each level own settings', () => {
    const levels = normalizeLevels(LEVELS);

    expect(levels.map((l) => l.isBonus)).toEqual([false, true, false]);
    expect(levels[2]).toMatchObject({ mediaSrc: 'c.jpg', cols: 4, rows: 4, type: 'hard' });
  });

  it('treats a level with isBonus but no type as a bonus level', () => {
    expect(normalizeLevels([levelWith({ type: undefined, isBonus: true })])[0].type).toBe('bonus');
  });

  it('gives an empty list for a missing list', () => {
    expect(normalizeLevels(undefined)).toEqual([]);
  });
});

describe('bannerFor', () => {
  it('gives no banner for a normal level', () => {
    expect(bannerFor(LEVELS[0], BANNER)).toBeNull();
  });

  it('gives the hard banner for a hard level', () => {
    expect(bannerFor(LEVELS[2], BANNER)).toEqual({ kind: 'hard', label: 'Hard Level' });
  });

  it('gives the bonus banner for a bonus level', () => {
    expect(bannerFor(LEVELS[1], BANNER)).toEqual({ kind: 'bonus', label: 'Bonus Level' });
  });
});

describe('validateLevels', () => {
  it('finds no problems in a good list', () => {
    expect(validateLevels(normalizeLevels(LEVELS), MEDIA, MIN_GRID)).toEqual([]);
  });

  it('reports an empty or missing list', () => {
    expect(validateLevels([], MEDIA, MIN_GRID)).toHaveLength(1);
    expect(validateLevels(undefined, MEDIA, MIN_GRID)).toHaveLength(1);
  });

  it('reports a level with no media', () => {
    const problems = validateLevels([levelWith({ mediaSrc: null })], MEDIA, MIN_GRID);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('mediaSrc');
  });

  it('reports a media file that does not exist', () => {
    const problems = validateLevels([levelWith({ mediaSrc: 'missing.gif' })], MEDIA, MIN_GRID);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('missing.gif');
  });

  it('reports a media file of a type the game cannot play', () => {
    const problems = validateLevels([levelWith({ mediaSrc: 'notes.txt' })], MEDIA, MIN_GRID);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('notes.txt');
  });

  it('reports a grid that is too small or not a whole number', () => {
    const levels = [levelWith({ id: 'x1', cols: 1 }), levelWith({ id: 'x2', rows: 2.5 })];

    const problems = validateLevels(levels, MEDIA, MIN_GRID);

    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('Level 1');
    expect(problems[1]).toContain('Level 2');
  });

  it('reports an unknown level type', () => {
    expect(validateLevels([levelWith({ type: 'impossible' })], MEDIA, MIN_GRID)).toHaveLength(1);
  });

  it('reports a level with no id', () => {
    const problems = validateLevels([levelWith({ id: undefined })], MEDIA, MIN_GRID);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('id');
  });

  it('reports an id that is used twice', () => {
    const problems = validateLevels([levelWith({ id: 'same' }), levelWith({ id: 'same' })], MEDIA, MIN_GRID);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('same');
  });

  it('reports a bonus (rotation) level whose tiles would not be square', () => {
    const problems = validateLevels(normalizeLevels([levelWith({ type: 'bonus', cols: 4, rows: 3 })]), MEDIA, MIN_GRID);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('bonus');
  });
});
