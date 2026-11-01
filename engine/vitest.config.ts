import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Always show console output so the golden-fixture summary
    // ("N still legacy-derived") is printed on every run.
    silent: false,
  },
});
