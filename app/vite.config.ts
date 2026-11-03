/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// One version for the whole app, in the root package.json (scripts/version.mjs).
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

// Tauri expects a fixed dev port and serves the built files from dist/.
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  // The layout worker imports the engine as a module (src/layout/layout.worker.ts).
  worker: { format: 'es' },
  build: {
    // WebView2 on Windows is evergreen Chromium.
    target: 'chrome120',
    outDir: 'dist',
    // Fonts are emitted as files, never inlined, so they stay cacheable and the CSP stays simple.
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
    css: { include: /.+/, modules: { classNameStrategy: 'non-scoped' } },
  },
});
