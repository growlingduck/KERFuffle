/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Tauri expects a fixed dev port and serves the built files from dist/.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
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
