/**
 * Every icon the game shows, from the Free Icon Pack v3.1 (Basic) by @gvesster
 * (license: assets/icons/LICENSE-free-icon-pack.txt). Each is a URL for an <img>.
 */
import lock from '../../assets/icons/lock.png';
import check from '../../assets/icons/check.png';
import hardFire from '../../assets/icons/hard-fire.png';
import bonusTrophy from '../../assets/icons/bonus-trophy.png';
import home from '../../assets/icons/home.png';
import hint from '../../assets/icons/hint.png';
import soundOn from '../../assets/icons/sound-on.png';
import soundOff from '../../assets/icons/sound-off.png';
import star from '../../assets/icons/star.png';
import star2 from '../../assets/icons/star-2.png';
import hintArrow from '../../assets/icons/hint-arrow.png';
import rotate from '../../assets/icons/rotate.png';
import rotateCursor from '../../assets/icons/rotate-cursor.png';
import missing from '../../assets/icons/missing.png';

export const ICONS = Object.freeze({
  /** A level the player cannot play yet. */
  lock,
  /** A finished level. */
  check,
  /** A hard level. */
  hard: hardFire,
  /** A bonus level, solved by rotating tiles. */
  bonus: bonusTrophy,
  /** The Home button, back to the level map. */
  home,
  /** The Hint button. */
  hint,
  /** The sound toggle, sound on and off. */
  soundOn,
  soundOff,
  /** Win-burst stars (two shapes, mixed) and merge sparkles. */
  stars: Object.freeze([star, star2]),
  /** The hint's arrow, pointing up as drawn; turned to face the target. */
  hintArrow,
  /** The rotate hint on bonus levels, spinning over the tile to tap. */
  rotate,
  /** The mouse cursor over a tile that can be rotated (64px, drawn at 32px). */
  rotateCursor,
  /** Shown when a level's picture cannot be loaded. */
  missing,
});

/**
 * The badge for a level type.
 * @param {string} type 'normal', 'bonus' or 'hard'.
 * @returns {string | null} An image URL, or null for normal levels.
 * @example badgeFor(level.type) // ICONS.hard for a hard level
 */
export function badgeFor(type) {
  if (type === 'bonus') return ICONS.bonus;
  if (type === 'hard') return ICONS.hard;
  return null;
}
