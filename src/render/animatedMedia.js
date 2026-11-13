import * as THREE from 'three';
import { animatedMimeType, cropSquare, resolveMediaSource } from '../core/media.js';
import { ICONS } from '../ui/icons.js';

const DEFAULT_GIF_FRAME_MS = 100;
const PLACEHOLDER_SIZE = 256;
const PLACEHOLDER_COLOR = '#c9d6cf';

/** Whether this browser can decode animated GIFs frame by frame. */
const canDecodeGif = () => typeof ImageDecoder !== 'undefined';

/**
 * Load the picture a level plays: an animated GIF, a looping video or a still
 * image from `mediaSrc`. Every tile of the board shows a slice of the one
 * texture this returns, so an animated GIF stays in step across all tiles.
 * The level's map card is built from the same call (see createLevelThumbnail),
 * so the two always match. A file that fails to load gets a plain placeholder.
 *
 * @param {object} level Level definition from normalizeLevels().
 * @param {object} [options]
 * @param {number} [options.maxAnisotropy=1]
 * @param {Object<string, string>} [options.mediaUrls] Map of fileName -> resolved asset URL.
 * @param {boolean} [options.firstFrameOnly=false] Load just the first frame (for thumbnails).
 * @returns {Promise<{
 *   texture: THREE.Texture,
 *   kind: 'video' | 'gif' | 'image' | 'placeholder',
 *   src: string | null,
 *   update: (deltaMs: number) => void,
 *   dispose: () => void,
 * }>}
 * @example const media = await createLevelMedia(level, { mediaUrls, maxAnisotropy: 8 });
 */
export async function createLevelMedia(level, { maxAnisotropy = 1, mediaUrls = {}, firstFrameOnly = false } = {}) {
  const source = resolveMediaSource(level, mediaUrls, { canDecodeGif: canDecodeGif() });
  let loaded = null;
  if (source.kind === 'gif') loaded = await tryLoadGifMedia(source.src, animatedMimeType(level.mediaSrc), maxAnisotropy, firstFrameOnly);
  else if (source.kind === 'video') loaded = await tryLoadVideoMedia(source.src, maxAnisotropy);
  else if (source.kind === 'image') loaded = await tryLoadImageMedia(source.src, maxAnisotropy);
  if (loaded) return loaded;
  if (source.kind !== 'placeholder' || source.reason !== 'none') {
    console.warn(`[media] Could not load the picture for level "${level?.id}" (${source.reason ?? 'load failed'}).`);
  }
  return createPlaceholderMedia();
}

/**
 * The pictures for a level's map card, made by loading the level's own media
 * exactly as the puzzle does.
 * - animated: what an unlocked card shows. For a GIF or still image this is the
 *   very same file the puzzle plays (a GIF keeps animating on the card).
 * - still: the first frame as a small JPEG, for locked cards (they are blurred,
 *   so there is no point animating them).
 * - view: where to place the animated picture inside the card so it shows the
 *   same square as the board (see cropSquare), as CSS percentages of the card.
 * @param {object} level Level definition from normalizeLevels().
 * @param {object} [options]
 * @param {Object<string, string>} [options.mediaUrls]
 * @param {number} [options.thumbSize=256] Size of the still, in pixels.
 * @returns {Promise<{animated: string, still: string, view: {left: number, top: number, width: number, height: number}}>}
 *   Urls for an <img>, and the animated picture's placement.
 * @example map.setThumbnail(level.id, await createLevelThumbnail(level, { mediaUrls }));
 */
export async function createLevelThumbnail(level, { mediaUrls = {}, thumbSize = 256 } = {}) {
  const media = await createLevelMedia(level, { mediaUrls, firstFrameOnly: true });
  try {
    const image = media.texture.image;
    const width = image.videoWidth || image.width || thumbSize;
    const height = image.videoHeight || image.height || thumbSize;
    const crop = cropSquare(width, height, level.trim);
    const still = snapshotSquare(image, crop, thumbSize);
    const isFile = (media.kind === 'gif' || media.kind === 'image') && media.src;
    const animated = isFile ? media.src : still;
    const view = isFile
      ? { left: (-crop.x / crop.side) * 100, top: (-crop.y / crop.side) * 100, width: (width / crop.side) * 100, height: (height / crop.side) * 100 }
      : { left: 0, top: 0, width: 100, height: 100 };
    return { animated, still, view };
  } finally {
    media.dispose();
  }
}

/** Draw the level's square of a picture (from cropSquare) into a small canvas. */
function snapshotSquare(source, { x, y, side }, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d').drawImage(source, x, y, side, side, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.86);
}

/** A plain square, used when a level's picture cannot be loaded, so the game keeps running. */
function createPlaceholderMedia() {
  const canvas = document.createElement('canvas');
  canvas.width = PLACEHOLDER_SIZE;
  canvas.height = PLACEHOLDER_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PLACEHOLDER_COLOR;
  ctx.fillRect(0, 0, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE);
  const texture = new THREE.CanvasTexture(canvas);
  // The pack's question mark in the middle, drawn in once it has loaded.
  const icon = new Image();
  icon.onload = () => {
    const side = PLACEHOLDER_SIZE * 0.45;
    ctx.drawImage(icon, (PLACEHOLDER_SIZE - side) / 2, (PLACEHOLDER_SIZE - side) / 2, side, side);
    texture.needsUpdate = true;
  };
  icon.src = ICONS.missing;
  texture.colorSpace = THREE.SRGBColorSpace;
  return {
    texture,
    kind: 'placeholder',
    src: null,
    update() {},
    dispose() {
      texture.dispose();
    },
  };
}


/** A still image as a texture. */
async function tryLoadImageMedia(src, maxAnisotropy) {
  try {
    const texture = await new THREE.TextureLoader().loadAsync(src);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = maxAnisotropy;
    return {
      texture,
      kind: 'image',
      src,
      update() {},
      dispose() {
        texture.dispose();
      },
    };
  } catch {
    return null;
  }
}

/**
 * Play an animated GIF or WebP through WebCodecs' ImageDecoder. Frames are decoded one
 * at a time, one frame ahead of playback, so memory stays at a frame or two
 * instead of every frame of the loop (about 50 MB for a 5-second 480px GIF).
 */
async function tryLoadGifMedia(src, mimeType, maxAnisotropy, firstFrameOnly) {
  if (!canDecodeGif()) return null;
  let decoder = null;
  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    decoder = new ImageDecoder({ data: await response.arrayBuffer(), type: mimeType });
    await decoder.tracks.ready;
    const frameCount = firstFrameOnly ? 1 : decoder.tracks.selectedTrack?.frameCount ?? 1;

    const first = (await decoder.decode({ frameIndex: 0 })).image;
    const width = first.displayWidth;
    const height = first.displayHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(first, 0, 0);
    let frameMs = frameDuration(first);
    first.close();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = maxAnisotropy;
    texture.needsUpdate = true;

    if (frameCount <= 1) {
      decoder.close();
      return { texture, kind: 'gif', src, update() {}, dispose: () => texture.dispose() };
    }

    let frameIndex = 0;
    let elapsed = 0;
    let ready = null;
    let disposed = false;
    const decodeNext = () => {
      const index = (frameIndex + 1) % frameCount;
      decoder
        .decode({ frameIndex: index })
        .then(({ image }) => {
          if (disposed) image.close();
          else ready = { image, index };
        })
        .catch(() => {});
    };
    decodeNext();

    return {
      texture,
      kind: 'gif',
      src,
      update(deltaMs) {
        elapsed += deltaMs;
        // Hold the current frame until it has been shown long enough and the next one is decoded.
        if (elapsed < frameMs || !ready) return;
        elapsed = Math.min(elapsed - frameMs, frameMs);
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(ready.image, 0, 0);
        frameMs = frameDuration(ready.image);
        frameIndex = ready.index;
        ready.image.close();
        ready = null;
        texture.needsUpdate = true;
        decodeNext();
      },
      dispose() {
        disposed = true;
        ready?.image.close();
        ready = null;
        try {
          decoder.close();
        } catch {
          // Already closed.
        }
        texture.dispose();
      },
    };
  } catch {
    try {
      decoder?.close();
    } catch {
      // Already closed.
    }
    return null;
  }
}

/** How long a decoded GIF frame should stay on screen, in milliseconds. */
function frameDuration(videoFrame) {
  const micros = videoFrame.duration;
  return Math.max(20, micros ? micros / 1000 : DEFAULT_GIF_FRAME_MS);
}

/**
 * Attempt to load an HTMLVideoElement as a looping, muted, inline VideoTexture.
 * Returns null if the video cannot be loaded or decoded.
 */
function tryLoadVideoMedia(src, maxAnisotropy) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.src = src;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('error', onError);
      resolve(result);
    };

    const onReady = () => {
      if (video.videoWidth <= 0 || video.videoHeight <= 0) {
        onError();
        return;
      }
      video.play().catch(() => {});
      const texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = maxAnisotropy;

      finish({
        texture,
        kind: 'video',
        src,
        update() {
          // VideoTexture updates itself during renderer.render when the video advances.
        },
        dispose() {
          video.pause();
          video.removeAttribute('src');
          video.load();
          texture.dispose();
        },
      });
    };

    const onError = () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      finish(null);
    };

    const timeoutId = setTimeout(onError, 4000);
    video.addEventListener('loadeddata', onReady, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.load();
  });
}
