/**
 * The difficulty sequence: every level's type and grid size come from its
 * place in the list, so the whole game ramps up the same way however many
 * levels there are. Pure logic: no DOM, no three.js.
 *
 * Levels come in blocks (10 by default). Inside a block the types follow one
 * pattern, a sawtooth: normal levels at the block's size, a hard spike in the
 * middle and at the end, and bonus (rotate) levels as breathers. Each block
 * steps the sizes up; blocks past the last one in the curve repeat it.
 */

/**
 * Where a level sits on the difficulty curve.
 * @param {number} index The level's place in the list (0-based).
 * @param {{blockSize: number, pattern: string[], blocks: {normal: number, hard: number, bonus: number}[]}} curve
 *   CONFIG.difficulty.
 * @returns {{type: string, size: number, block: number}} The level's type, its
 *   grid size (size x size tiles) and which block it is in (0-based).
 * @example levelPlan(4, CONFIG.difficulty) // { type: 'hard', size: 4, block: 0 }
 */
export function levelPlan(index, curve) {
  const block = Math.floor(index / curve.blockSize);
  const type = curve.pattern[index % curve.blockSize] ?? 'normal';
  const sizes = curve.blocks[Math.min(block, curve.blocks.length - 1)];
  return { type, size: sizes[type] ?? sizes.normal, block };
}

/**
 * Give every level its type and grid from the curve. A level that sets its
 * own cols, rows or type keeps them (for testing a picture); every other
 * level follows the sequence.
 * @param {object[]} levels CONFIG.levels (each needs at least id and mediaSrc).
 * @param {object} curve CONFIG.difficulty.
 * @returns {object[]} New level objects with type, cols and rows filled in.
 * @example normalizeLevels(applyDifficulty(CONFIG.levels, CONFIG.difficulty))
 */
export function applyDifficulty(levels, curve) {
  if (!Array.isArray(levels)) return [];
  return levels.map((level, index) => {
    const plan = levelPlan(index, curve);
    return { ...level, type: level.type ?? plan.type, cols: level.cols ?? plan.size, rows: level.rows ?? plan.size };
  });
}

/**
 * How hard a level is, as one number: its tile count, with rotate (bonus)
 * levels counted at half because each tile only needs tapping upright.
 * @param {{type: string, cols: number, rows: number}} level
 * @returns {number}
 * @example difficultyScore({ type: 'normal', cols: 4, rows: 4 }) // 16
 */
export function difficultyScore(level) {
  const tiles = level.cols * level.rows;
  return level.type === 'bonus' ? tiles / 2 : tiles;
}

/**
 * Check that a level list really follows a difficulty sequence:
 * - normal levels never get smaller than an earlier normal level;
 * - every hard level is at least as big as the normal level before it, and
 *   never smaller than an earlier hard level;
 * - bonus levels never get smaller than an earlier bonus level, and stay
 *   easier than the normal level before them (they are breathers).
 * @param {object[]} levels Levels with type, cols and rows (after applyDifficulty).
 * @returns {string[]} One message per break in the sequence; empty when it holds.
 * @example checkDifficultySequence(levels) // []
 */
export function checkDifficultySequence(levels) {
  const problems = [];
  const last = { normal: null, hard: null, bonus: null };
  levels.forEach((level, index) => {
    const name = `Level ${index + 1} (${level.id ?? '?'})`;
    const tiles = level.cols * level.rows;
    const previous = last[level.type];
    if (previous && tiles < previous.tiles) {
      problems.push(`${name}: ${level.type} level has ${tiles} tiles, fewer than level ${previous.number} (${previous.tiles}).`);
    }
    if (level.type === 'hard' && last.normal && tiles < last.normal.tiles) {
      problems.push(`${name}: hard level is smaller than the normal level ${last.normal.number} before it.`);
    }
    if (level.type === 'bonus' && last.normal && difficultyScore(level) > last.normal.tiles) {
      problems.push(`${name}: bonus level is harder than the normal level ${last.normal.number} before it.`);
    }
    if (last[level.type] === undefined) return;
    last[level.type] = { tiles, number: index + 1 };
  });
  return problems;
}
