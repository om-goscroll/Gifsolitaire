import { describe, it, expect } from 'vitest';
import { animatedMimeType, cropSquare, mediaKindOf, resolveMediaSource } from '../../../src/core/media.js';

// Fixtures
const URLS = {
  'loop.gif': '/assets/gifs/loop.gif',
  'clip.mp4': '/assets/clip.mp4',
  'photo.jpg': '/assets/gifs/photo.jpg',
};

describe('mediaKindOf', () => {
  it('recognises gifs, videos and still images by extension', () => {
    expect(mediaKindOf('loop.gif')).toBe('gif');
    expect(mediaKindOf('clip.MP4')).toBe('video');
    expect(mediaKindOf('clip.webm')).toBe('video');
    expect(mediaKindOf('photo.jpeg')).toBe('image');
    expect(mediaKindOf('photo.png?v=2')).toBe('image');
  });

  it('returns null for unsupported or missing names', () => {
    expect(mediaKindOf('notes.txt')).toBeNull();
    expect(mediaKindOf('no-extension')).toBeNull();
    expect(mediaKindOf(undefined)).toBeNull();
  });
});

describe('resolveMediaSource', () => {
  it('uses a placeholder when a level has no media', () => {
    expect(resolveMediaSource({ mediaSrc: null }, URLS)).toEqual({ kind: 'placeholder', src: null, reason: 'none' });
  });

  it('resolves a known gif, video or image to its url', () => {
    expect(resolveMediaSource({ mediaSrc: 'loop.gif' }, URLS)).toEqual({ kind: 'gif', src: '/assets/gifs/loop.gif', reason: null });
    expect(resolveMediaSource({ mediaSrc: 'clip.mp4' }, URLS).kind).toBe('video');
    expect(resolveMediaSource({ mediaSrc: 'photo.jpg' }, URLS).kind).toBe('image');
  });

  it('uses a placeholder when the file is missing', () => {
    expect(resolveMediaSource({ mediaSrc: 'gone.gif' }, URLS)).toEqual({ kind: 'placeholder', src: null, reason: 'missing' });
  });

  it('uses a placeholder for a file type it cannot play', () => {
    expect(resolveMediaSource({ mediaSrc: 'notes.txt' }, URLS).reason).toBe('unsupported-type');
  });

  it('shows a gif as a still of the same file when the browser cannot decode gif frames', () => {
    const source = resolveMediaSource({ mediaSrc: 'loop.gif' }, URLS, { canDecodeGif: false });

    expect(source).toEqual({ kind: 'image', src: '/assets/gifs/loop.gif', reason: 'gif-unsupported' });
  });

  it('accepts a direct path that is not in the known files', () => {
    expect(resolveMediaSource({ mediaSrc: '/media/extra.gif' }, URLS)).toEqual({
      kind: 'gif',
      src: '/media/extra.gif',
      reason: null,
    });
  });
});

describe('animated WebP', () => {
  it('plays an animated webp frame by frame like a gif', () => {
    expect(mediaKindOf('river.webp')).toBe('gif');
    expect(animatedMimeType('river.webp')).toBe('image/webp');
    expect(animatedMimeType('loop.gif')).toBe('image/gif');
  });
});

describe('cropSquare', () => {
  // Fixtures: a landscape and a portrait picture.
  const WIDE = { width: 400, height: 300 };
  const TALL = { width: 300, height: 400 };

  it('takes the largest centred square when there is no trim', () => {
    expect(cropSquare(WIDE.width, WIDE.height)).toEqual({ x: 50, y: 0, side: 300 });
    expect(cropSquare(TALL.width, TALL.height)).toEqual({ x: 0, y: 50, side: 300 });
  });

  it('leaves a trimmed bottom strip out of the square', () => {
    const { x, y, side } = cropSquare(WIDE.width, WIDE.height, { bottom: 0.1 });

    expect(side).toBe(270);
    expect(y + side).toBeLessThanOrEqual(270);
    expect(x).toBe(65);
  });

  it('never trims away more than most of an edge', () => {
    const { side } = cropSquare(WIDE.width, WIDE.height, { left: 5, right: 5 });

    expect(side).toBeGreaterThan(0);
  });
});
