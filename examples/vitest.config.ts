import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    /**
     * These tests boot the real API — migrations, HTTP server, the send worker
     * — before running each example. Root-level test options are NOT inherited
     * by workspace projects, so the budget is declared here.
     */
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
