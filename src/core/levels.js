/**
 * Pure rules for the level list: how a level is described, whether it opens
 * with a banner, and whether the list in the config is usable. No rendering,
 * no DOM.
 *
 * A level is { id, mediaSrc, cols, rows, type } where type is one of LEVEL_TYPES.
 */
import { mediaKindOf } from './media.js';

/** Every level type. 'normal' levels start straight away; the others open with a banner. */
export const LEVEL_TYPES = Object.freeze(['normal', 'bonus', 'hard']);

/**
 * The levels from the config, in play order, each with its place in the list:
 * index (0-based), number (1-based, as players see it) and isBonus.
 * @param {object[]} levels CONFIG.levels.
 * @returns {object[]}
 * @example normalizeLevels(CONFIG.levels)[0].number // 1
 */
export function normalizeLevels(levels) {
  if (!Array.isArray(levels)) return [];
  return levels.map((level, index) => {
    const isBonus = Boolean(level.isBonus || level.type === 'bonus');
    return {
      ...level,
      type: level.type ?? (isBonus ? 'bonus' : 'normal'),
      isBonus,
      index,
      number: index + 1,
    };
  });
}

/**
 * The banner a level opens with.
 * @param {{type: string}} level
 * @param {{labels: Object<string, string>}} bannerConfig
 * @returns {{kind: string, label: string} | null} null when the level starts
 *   without a banner. The banner's badge comes from ui/badges.js by kind.
 * @example bannerFor({ type: 'hard' }, CONFIG.banner) // { kind: 'hard', label: 'Hard Level' }
 */
export function bannerFor(level, bannerConfig) {
  const label = bannerConfig.labels[level.type];
  if (!label) return null;
  return { kind: level.type, label };
}

/**
 * Check a level list before the game uses it.
 * @param {object[]} levels The list from normalizeLevels().
 * @param {string[]} mediaNames Media file names the game can load (GIFs, videos, images).
 * @param {number} minGrid Smallest allowed number of columns or rows.
 * @returns {string[]} One message per problem; empty when the list is fine.
 * @example validateLevels(levels, Object.keys(mediaUrls), CONFIG.board.minGrid)
 */
export function validateLevels(levels, mediaNames, minGrid) {
  const problems = [];
  if (!Array.isArray(levels) || levels.length === 0) return ['The level list is empty.'];
  const seenIds = new Set();
  levels.forEach((level, i) => {
    const name = `Level ${i + 1}`;
    if (typeof level.id !== 'string' || level.id === '') problems.push(`${name}: needs an id.`);
    else if (seenIds.has(level.id)) problems.push(`${name}: id "${level.id}" is used more than once.`);
    else seenIds.add(level.id);
    if (!level.mediaSrc) problems.push(`${name}: needs a mediaSrc (its GIF).`);
    else if (!mediaKindOf(level.mediaSrc)) problems.push(`${name}: "${level.mediaSrc}" is not a GIF, video or image.`);
    else if (!level.mediaSrc.includes('/') && !mediaNames.includes(level.mediaSrc)) {
      problems.push(`${name}: media file "${level.mediaSrc}" was not found.`);
    }
    if (!Number.isInteger(level.cols) || level.cols < minGrid) problems.push(`${name}: cols must be a whole number of at least ${minGrid}.`);
    if (!Number.isInteger(level.rows) || level.rows < minGrid) problems.push(`${name}: rows must be a whole number of at least ${minGrid}.`);
    if (!LEVEL_TYPES.includes(level.type)) problems.push(`${name}: unknown type "${level.type}".`);
    // Rotating a tile only fits back into its slot when the tiles are square.
    if (level.isBonus && level.cols !== level.rows) problems.push(`${name}: a bonus (rotation) level needs as many cols as rows.`);
  });
  return problems;
}
