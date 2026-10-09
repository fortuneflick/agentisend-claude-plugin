import { statSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * `vitest related` (the pre-push gate) walks each test's imports to find the
 * tests a change touches. vitest 3.2 joins every import it did not resolve to
 * a file onto the project root, so the bare package `fastify` becomes
 * `examples/fastify` — and six example folders here share a name with a
 * package they import (astro, better-auth, express, fastify, hono,
 * react-router). The walk then asked Vite to load a folder, and every
 * `vitest related` run in the repo stopped with ERR_LOAD_URL before a test
 * ran (2026-09-30 → 10-06; pushes to main went out with --no-verify).
 *
 * A folder is never a module, so loading one as an empty module ends that
 * branch of the walk and changes nothing else.
 */
const folderIsNotAModule: Plugin = {
  name: 'agentisend:folder-is-not-a-module',
  enforce: 'pre',
  load(id) {
    try {
      return statSync(id).isDirectory() ? 'export {};' : null;
    } catch {
      return null;
    }
  },
};

export default defineConfig({
  plugins: [folderIsNotAModule],
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
