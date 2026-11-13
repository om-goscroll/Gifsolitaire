/**
 * Decides what picture a level shows. This is the single source of truth used
 * by both the puzzle board and the level's card on the level map, so the two
 * can never disagree. Pure logic: no DOM, no three.js.
 */

const KIND_BY_EXTENSION = Object.freeze({
  gif: 'gif',
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  m4v: 'video',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  // Animated WebP plays through the same frame-by-frame decoder as a GIF.
  webp: 'gif',
  avif: 'image',
});

/**
 * The kind of media a file name holds, from its extension.
 * @param {string} fileName
 * @returns {'gif' | 'video' | 'image' | null} null for anything unsupported. 'gif' means an
 *   animated picture played frame by frame: a GIF or a WebP.
 * @example mediaKindOf('meadow.gif') // 'gif'
 */
export function mediaKindOf(fileName) {
  if (typeof fileName !== 'string') return null;
  const match = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(fileName);
  return match ? KIND_BY_EXTENSION[match[1].toLowerCase()] ?? null : null;
}

/**
 * Where a level's picture comes from. A GIF in a browser that cannot decode
 * GIF frames plays as a still of its first frame (still the right picture).
 * A level with no `mediaSrc`, or a file that is missing or of an unknown type,
 * gets a plain placeholder so the game keeps running.
 * @param {{mediaSrc?: string | null}} level
 * @param {Object<string, string>} mediaUrls Known media files: { fileName: url }.
 * @param {{canDecodeGif?: boolean}} [support] What this browser can play.
 * @returns {{kind: 'gif' | 'video' | 'image' | 'placeholder', src: string | null, reason: string | null}}
 *   reason explains a fallback: 'none', 'missing', 'unsupported-type' or 'gif-unsupported'.
 * @example resolveMediaSource({ mediaSrc: 'cat.gif' }, { 'cat.gif': '/assets/gifs/cat.gif' }) // { kind: 'gif', src: '/assets/gifs/cat.gif', reason: null }
 */
export function resolveMediaSource(level, mediaUrls, { canDecodeGif = true } = {}) {
  const name = level?.mediaSrc;
  if (!name) return { kind: 'placeholder', src: null, reason: 'none' };
  const kind = mediaKindOf(name);
  if (!kind) return { kind: 'placeholder', src: null, reason: 'unsupported-type' };
  const src = mediaUrls?.[name] ?? (name.includes('/') ? name : null);
  if (!src) return { kind: 'placeholder', src: null, reason: 'missing' };
  if (kind === 'gif' && !canDecodeGif) return { kind: 'image', src, reason: 'gif-unsupported' };
  return { kind, src, reason: null };
}

/**
 * The MIME type of an animated picture, for the frame decoder.
 * @param {string} fileName
 * @returns {'image/webp' | 'image/gif'}
 * @example animatedMimeType('rain.webp') // 'image/webp'
 */
export function animatedMimeType(fileName) {
  return /.webp(?:[?#].*)?$/i.test(fileName ?? '') ? 'image/webp' : 'image/gif';
}

/**
 * The square of a picture a level shows, in pixels. First the level's trim is
 * cut from each edge (fractions of the width or height, to hide a watermark or
 * a stray border), then the largest square is taken from the middle of what is
 * left. The board, the locked card and the playable card all use this, so they
 * always show the same part of the picture.
 * @param {number} width Picture width in pixels.
 * @param {number} height Picture height in pixels.
 * @param {{left?: number, top?: number, right?: number, bottom?: number}} [trim]
 * @returns {{x: number, y: number, side: number}} Top-left corner and side length.
 * @example cropSquare(400, 300) // { x: 50, y: 0, side: 300 }
 * @example cropSquare(400, 300, { bottom: 0.1 }) // { x: 65, y: 0, side: 270 }
 */
export function cropSquare(width, height, trim = {}) {
  const clamp = (v) => Math.min(Math.max(Number(v) || 0, 0), 0.45);
  const left = clamp(trim.left) * width;
  const right = clamp(trim.right) * width;
  const top = clamp(trim.top) * height;
  const bottom = clamp(trim.bottom) * height;
  const innerW = width - left - right;
  const innerH = height - top - bottom;
  const side = Math.min(innerW, innerH);
  return { x: left + (innerW - side) / 2, y: top + (innerH - side) / 2, side };
}
