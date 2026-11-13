import { describe, it, expect } from 'vitest';
import { Progress, saveProgress, loadProgress, migrateSave, SAVE_VERSION } from '../../../src/core/progress.js';

// Fixtures
const IDS = ['a-1', 'a-2', 'a-3', 'b-1'];
const KEY = 'test-progress';

/** An in-memory stand-in for localStorage. */
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

/** Storage that refuses everything, like a browser with storage switched off. */
const brokenStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('Progress', () => {
  it('starts with nothing finished and only the first level unlocked', () => {
    const progress = new Progress(IDS);

    expect(progress.completedCount).toBe(0);
    expect(IDS.map((_, i) => progress.isUnlocked(i))).toEqual([true, false, false, false]);
    expect(progress.nextPlayable()).toBe(0);
  });

  it('unlocks the following level when a level is finished', () => {
    const progress = new Progress(IDS);

    const wasNew = progress.complete(0);

    expect(wasNew).toBe(true);
    expect(progress.isCompleted(0)).toBe(true);
    expect(progress.isUnlocked(1)).toBe(true);
    expect(progress.isUnlocked(2)).toBe(false);
    expect(progress.nextPlayable()).toBe(1);
  });

  it('does not count a level twice when it is finished again', () => {
    const progress = new Progress(IDS);
    progress.complete(0);

    const wasNew = progress.complete(0);

    expect(wasNew).toBe(false);
    expect(progress.completedCount).toBe(1);
  });

  it('ignores a level index that does not exist', () => {
    const progress = new Progress(IDS);

    expect(progress.complete(99)).toBe(false);
    expect(progress.isUnlocked(99)).toBe(false);
    expect(progress.isUnlocked(-1)).toBe(false);
    expect(progress.completedCount).toBe(0);
  });

  it('has no next level once everything is finished', () => {
    const progress = new Progress(IDS);
    IDS.forEach((_, i) => progress.complete(i));

    expect(progress.nextPlayable()).toBe(-1);
    expect(progress.completedCount).toBe(IDS.length);
  });

  it('counts the finished levels within a set of levels', () => {
    const progress = new Progress(IDS);
    progress.complete(0);
    progress.complete(1);

    expect(progress.countCompleted([0, 1, 2])).toBe(2);
    expect(progress.countCompleted([3])).toBe(0);
  });

  it('forgets everything on reset', () => {
    const progress = new Progress(IDS);
    progress.complete(0);

    progress.reset();

    expect(progress.completedCount).toBe(0);
    expect(progress.isUnlocked(1)).toBe(false);
  });

  it('round-trips through its saved data', () => {
    const progress = new Progress(IDS);
    progress.complete(1);
    progress.complete(0);

    const restored = new Progress(IDS).load(progress.toData());

    expect(progress.toData().completed).toEqual(['a-1', 'a-2']);
    expect(restored.isCompleted(0)).toBe(true);
    expect(restored.isCompleted(1)).toBe(true);
    expect(restored.nextPlayable()).toBe(2);
  });

  it('ignores malformed saved data and ids that are no longer levels', () => {
    expect(new Progress(IDS).load(null).completedCount).toBe(0);
    expect(new Progress(IDS).load('nonsense').completedCount).toBe(0);
    expect(new Progress(IDS).load({ completed: 'a-1' }).completedCount).toBe(0);
    expect(new Progress(IDS).load({ completed: ['a-1', 'gone-9', 42, null] }).completedCount).toBe(1);
  });
});

describe('saveProgress and loadProgress', () => {
  it('saves progress and loads it back', () => {
    const storage = fakeStorage();
    const progress = new Progress(IDS);
    progress.complete(0);

    const saved = saveProgress(storage, KEY, progress);
    const loaded = loadProgress(storage, KEY, IDS);

    expect(saved).toBe(true);
    expect(loaded.isCompleted(0)).toBe(true);
    expect(loaded.completedCount).toBe(1);
  });

  it('starts fresh when nothing has been saved', () => {
    expect(loadProgress(fakeStorage(), KEY, IDS).completedCount).toBe(0);
  });

  it('starts fresh when the saved text is not valid JSON', () => {
    const storage = fakeStorage({ [KEY]: '{not json' });

    expect(loadProgress(storage, KEY, IDS).completedCount).toBe(0);
  });

  it('does not throw when storage is unavailable', () => {
    const progress = new Progress(IDS);

    expect(saveProgress(brokenStorage, KEY, progress)).toBe(false);
    expect(saveProgress(null, KEY, progress)).toBe(false);
    expect(loadProgress(brokenStorage, KEY, IDS).completedCount).toBe(0);
    expect(loadProgress(null, KEY, IDS).completedCount).toBe(0);
  });
});

describe('migrateSave', () => {
  const OLD_IDS = ['meadow-1', 'meadow-2', 'meadow-3'];

  it('keeps a current-version save as it is, dropping ids that are gone', () => {
    const data = { version: SAVE_VERSION, completed: ['a-1', 'gone', 'a-2'] };

    expect(migrateSave(data, IDS)).toEqual({ version: SAVE_VERSION, completed: ['a-1', 'a-2'] });
  });

  it('carries over how many levels an old save had finished', () => {
    const data = { version: 1, completed: OLD_IDS };

    expect(migrateSave(data, IDS)).toEqual({ version: SAVE_VERSION, completed: ['a-1', 'a-2', 'a-3'] });
  });

  it('never carries over more levels than exist now', () => {
    const data = { version: 1, completed: ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7'] };

    expect(migrateSave(data, IDS).completed).toEqual(IDS);
  });

  it('keeps matching ids from an old save whose levels still exist', () => {
    expect(migrateSave({ version: 1, completed: ['a-1', 'a-2'] }, IDS).completed).toEqual(['a-1', 'a-2']);
  });

  it('counts a repeated old id once', () => {
    expect(migrateSave({ completed: ['meadow-1', 'meadow-1'] }, IDS).completed).toEqual(['a-1']);
  });

  it('gives nothing for data that is not a save', () => {
    expect(migrateSave(null, IDS)).toBeNull();
    expect(migrateSave('text', IDS)).toBeNull();
    expect(migrateSave({ completed: 'a-1' }, IDS)).toBeNull();
  });
});

describe('loadProgress migration', () => {
  const LEGACY = 'old-progress';
  const OLD_SAVE = JSON.stringify({ version: 1, completed: ['meadow-1', 'meadow-2'] });

  it('moves an old save from a legacy key to the current key and removes the old key', () => {
    const storage = fakeStorage({ [LEGACY]: OLD_SAVE });

    const progress = loadProgress(storage, KEY, IDS, { legacyKeys: [LEGACY] });

    expect(progress.completedCount).toBe(2);
    expect(progress.isUnlocked(2)).toBe(true);
    expect(JSON.parse(storage.data[KEY])).toEqual({ version: SAVE_VERSION, completed: ['a-1', 'a-2'] });
    expect(LEGACY in storage.data).toBe(false);
  });

  it('upgrades an old-format save stored under the current key', () => {
    const storage = fakeStorage({ [KEY]: OLD_SAVE });

    loadProgress(storage, KEY, IDS);

    expect(JSON.parse(storage.data[KEY]).version).toBe(SAVE_VERSION);
  });

  it('prefers the current key over a legacy one', () => {
    const current = JSON.stringify({ version: SAVE_VERSION, completed: ['a-1'] });
    const storage = fakeStorage({ [KEY]: current, [LEGACY]: OLD_SAVE });

    const progress = loadProgress(storage, KEY, IDS, { legacyKeys: [LEGACY] });

    expect(progress.completedCount).toBe(1);
    expect(LEGACY in storage.data).toBe(true);
  });

  it('migrates only once: a second load reads the new save unchanged', () => {
    const storage = fakeStorage({ [LEGACY]: OLD_SAVE });
    loadProgress(storage, KEY, IDS, { legacyKeys: [LEGACY] });
    const saved = storage.data[KEY];

    const again = loadProgress(storage, KEY, IDS, { legacyKeys: [LEGACY] });

    expect(again.completedCount).toBe(2);
    expect(storage.data[KEY]).toBe(saved);
  });
});
