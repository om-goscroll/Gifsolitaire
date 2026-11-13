import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Two builds:
 * - `npm run build` makes the usual web build in dist/: an HTML page plus
 *   separate script, image, GIF and audio files (best for hosting).
 * - `npm run build:inline` (mode "inline") makes one self-contained file,
 *   dist-inline/index.html, with every script, style, icon, GIF and sound
 *   embedded in it. It plays offline by double-clicking it; no server needed.
 *
 * Dev-server settings: on Windows, Vite's native file watcher crashes the whole
 * dev server (EBUSY) when it opens a file that is still being copied in, such
 * as a large GIF dropped into assets/gifs/. Polling file timestamps instead
 * never opens the file, so it cannot hit that lock; waiting for writes to
 * settle means a half-copied file is never picked up. Folders the game never
 * imports are not watched at all, which keeps polling cheap.
 */
export default defineConfig(({ mode }) => {
  const inline = mode === 'inline';
  return {
    plugins: inline ? [viteSingleFile()] : [],
    build: inline
      ? {
          outDir: 'dist-inline',
          // Embed every asset, however large, as a data URL.
          assetsInlineLimit: () => true,
          // One file means no chunks to warn about.
          chunkSizeWarningLimit: 200_000,
        }
      : {},
    server: {
      watch: {
        usePolling: true,
        interval: 300,
        binaryInterval: 1000,
        awaitWriteFinish: { stabilityThreshold: 600, pollInterval: 100 },
        ignored: ['**/dist/**', '**/dist-inline/**', '**/production/**', '**/studio-tests/**', '**/.claude/**', '**/docs/**', '**/design/**', '**/GIFs/**'],
      },
    },
  };
});
