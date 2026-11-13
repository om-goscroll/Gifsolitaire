/**
 * Which levels the player has finished, which are unlocked, and how that is
 * saved. Pure state: storage is passed in, so nothing here touches the browser
 * directly and all of it can be unit-tested.
 *
 * Levels are identified by their id strings (from the config), so saved
 * progress survives levels being added or reordered.
 */

/** Version 2: completed holds ids of the unified level list. Version 1 held world-based ids. */
export const SAVE_VERSION = 2;

/** The player's progress through an ordered list of levels. */
export class Progress {
  /**
   * @param {string[]} levelIds Every level id, in play order.
   * @example const progress = new Progress(levels.map((level) => level.id));
   */
  constructor(levelIds) {
    this.levelIds = [...levelIds];
    this.completed = new Set();
  }

  /** How many levels have been finished. */
  get completedCount() {
    return this.completed.size;
  }

  /** Whether the level at this index has been finished. */
  isCompleted(index) {
    return this.completed.has(this.levelIds[index]);
  }

  /**
   * Whether the level at this index can be played: the first level always can,
   * and any other once the level before it is finished. A finished level stays
   * unlocked for replay.
   * @example progress.isUnlocked(0) // true
   */
  isUnlocked(index) {
    if (index < 0 || index >= this.levelIds.length) return false;
    return index === 0 || this.isCompleted(index - 1) || this.isCompleted(index);
  }

  /**
   * Mark a level finished.
   * @returns {boolean} true if it was not finished before.
   * @example if (progress.complete(index)) saveProgress(storage, key, progress);
   */
  complete(index) {
    const id = this.levelIds[index];
    if (id === undefined || this.completed.has(id)) return false;
    this.completed.add(id);
    return true;
  }

  /**
   * The first level that has not been finished.
   * @returns {number} Its index, or -1 when every level is finished.
   */
  nextPlayable() {
    return this.levelIds.findIndex((id) => !this.completed.has(id));
  }

  /**
   * How many of the given levels are finished.
   * @param {number[]} indices Level indices.
   */
  countCompleted(indices) {
    return indices.filter((index) => this.isCompleted(index)).length;
  }

  /** Forget all progress. */
  reset() {
    this.completed.clear();
  }

  /**
   * The progress as plain data, ready to be saved.
   * @returns {{version: number, completed: string[]}}
   */
  toData() {
    return { version: SAVE_VERSION, completed: this.levelIds.filter((id) => this.completed.has(id)) };
  }

  /**
   * Replace the progress with saved data. Anything malformed, and any id that
   * is no longer a level, is ignored.
   * @param {unknown} data What toData() produced earlier.
   * @returns {Progress} this
   */
  load(data) {
    this.completed.clear();
    if (!data || typeof data !== 'object' || !Array.isArray(data.completed)) return this;
    for (const id of data.completed) {
      if (typeof id === 'string' && this.levelIds.includes(id)) this.completed.add(id);
    }
    return this;
  }
}

/**
 * Save progress. Never throws: storage can be full or switched off.
 * @param {{setItem: (key: string, value: string) => void} | null} storage For example window.localStorage.
 * @param {string} key
 * @param {Progress} progress
 * @returns {boolean} Whether the save worked.
 * @example saveProgress(window.localStorage, CONFIG.save.key, progress);
 */
export function saveProgress(storage, key, progress) {
  try {
    storage.setItem(key, JSON.stringify(progress.toData()));
    return true;
  } catch {
    return false;
  }
}

/**
 * Bring saved data from any older version up to the current one.
 *
 * A version-1 save (or one with no version) recorded finished levels by ids
 * that may no longer exist, from before the levels were renumbered into one
 * list. When none of those ids are current levels, the number of levels the
 * player had finished is carried over instead: they keep that many levels
 * finished, from the start of the list, so the counter and unlocks stay right.
 * @param {unknown} data Parsed save data.
 * @param {string[]} levelIds Every current level id, in play order.
 * @returns {{version: number, completed: string[]} | null} null when there is nothing usable.
 * @example migrateSave({ version: 1, completed: ['meadow-1', 'meadow-2'] }, ids) // { version: 2, completed: [ids[0], ids[1]] }
 */
export function migrateSave(data, levelIds) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.completed)) return null;
  const saved = [...new Set(data.completed.filter((id) => typeof id === 'string'))];
  const known = saved.filter((id) => levelIds.includes(id));
  if (data.version === SAVE_VERSION || known.length > 0) {
    return { version: SAVE_VERSION, completed: known };
  }
  return { version: SAVE_VERSION, completed: levelIds.slice(0, Math.min(saved.length, levelIds.length)) };
}

/**
 * Load saved progress, or start fresh when there is none or it cannot be read.
 * A save found only under an old key, or in an old format, is migrated to the
 * current key and format and the old key is removed, so this happens once.
 * @param {Storage | null} storage For example window.localStorage.
 * @param {string} key Where progress is saved now.
 * @param {string[]} levelIds Every level id, in play order.
 * @param {{legacyKeys?: string[]}} [options] Older keys to migrate from.
 * @returns {Progress}
 * @example const progress = loadProgress(localStorage, CONFIG.save.key, ids, { legacyKeys: CONFIG.save.legacyKeys });
 */
export function loadProgress(storage, key, levelIds, { legacyKeys = [] } = {}) {
  const progress = new Progress(levelIds);
  try {
    let raw = storage.getItem(key);
    let fromKey = key;
    for (const legacy of legacyKeys) {
      if (raw) break;
      raw = storage.getItem(legacy);
      fromKey = legacy;
    }
    if (!raw) return progress;
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Corrupt save: start fresh.
    }
    const data = migrateSave(parsed, levelIds);
    if (data) progress.load(data);
    const changed = fromKey !== key || !parsed || parsed.version !== SAVE_VERSION;
    if (changed) {
      saveProgress(storage, key, progress);
      if (fromKey !== key) storage.removeItem(fromKey);
    }
  } catch {
    // Storage switched off: start fresh for this visit.
  }
  return progress;
}
