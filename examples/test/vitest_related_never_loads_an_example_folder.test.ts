import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import examplesConfig from '../vitest.config.js';

/**
 * `vitest related` (the pre-push gate) stopped with ERR_LOAD_URL on every
 * run from 2026-09-30 to 2026-10-06: its import walk joins a bare package
 * name onto the project root, and example folders share names with the
 * packages they import (`fastify` → `examples/fastify`), so Vite was asked to
 * load a folder. The examples project loads a folder as an empty module.
 */
const EXAMPLES = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The part of a Vite plugin this reads. */
interface LoadPlugin {
  name?: string;
  load?: unknown;
}

function folderPlugin(): LoadPlugin {
  const plugins = ((examplesConfig as { plugins?: unknown[] }).plugins ?? []).flat() as LoadPlugin[];
  const plugin = plugins.find((p) => p?.name === 'agentisend:folder-is-not-a-module');
  expect(plugin).toBeDefined();
  return plugin!;
}

function load(plugin: LoadPlugin, id: string): unknown {
  const hook = plugin.load as (this: unknown, id: string) => unknown;
  return hook.call({}, id);
}

describe('vitest related never loads an example folder', () => {
  it('example folders still share names with packages the examples import', () => {
    // If none did, the plugin would be dead weight; this names why it exists.
    for (const name of ['fastify', 'express', 'hono']) {
      expect(statSync(join(EXAMPLES, name)).isDirectory()).toBe(true);
      expect(existsSync(join(EXAMPLES, 'node_modules', name))).toBe(true);
    }
  });

  it('a folder loads as an empty module', () => {
    expect(load(folderPlugin(), join(EXAMPLES, 'fastify'))).toBe('export {};');
  });

  it('a file and a missing path are left to Vite', () => {
    const plugin = folderPlugin();
    expect(load(plugin, join(EXAMPLES, 'fastify/server.ts'))).toBeNull();
    expect(load(plugin, join(EXAMPLES, 'no-such-thing'))).toBeNull();
  });
});
