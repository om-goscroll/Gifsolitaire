import { defineConfig } from 'vite';

/**
 * Dev-server settings. On Windows, Vite's native file watcher crashes the whole
 * dev server (EBUSY) when it opens a file that is still being copied in, such
 * as a large GIF dropped into assets/gifs/. Polling file timestamps instead
 * never opens the file, so it cannot hit that lock; waiting for writes to
 * settle means a half-copied file is never picked up. Folders the game never
 * imports are not watched at all, which keeps polling cheap.
 */
export default defineConfig({
  server: {
    watch: {
      usePolling: true,
      interval: 300,
      binaryInterval: 1000,
      awaitWriteFinish: { stabilityThreshold: 600, pollInterval: 100 },
      ignored: ['**/dist/**', '**/production/**', '**/studio-tests/**', '**/.claude/**', '**/docs/**', '**/design/**', '**/GIFs/**'],
    },
  },
});
