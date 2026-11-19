// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { FileStore } from '../storage/FileStore.js';

describe('FileStore', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pumpkit-store-'));
  });

  it('returns the default when the file does not exist, creating the directory', () => {
    const store = new FileStore({ path: join(dir, 'nested', 'a.json'), defaultValue: { n: 0 } });
    expect(store.read()).toEqual({ n: 0 });
    expect(existsSync(join(dir, 'nested'))).toBe(true);
  });

  it('round-trips a value and leaves no temp file', () => {
    const store = new FileStore({ path: join(dir, 'a.json'), defaultValue: [] as string[] });
    store.write(['x', 'y']);
    expect(store.read()).toEqual(['x', 'y']);
    expect(existsSync(join(dir, 'a.json.tmp'))).toBe(false);
  });

  it('moves a corrupt file aside instead of letting the next write replace it', () => {
    const path = join(dir, 'a.json');
    writeFileSync(path, '[{"half": ');
    const store = new FileStore({ path, defaultValue: [] as string[] });
    expect(store.read()).toEqual([]);
    const aside = readdirSync(dir).filter((f) => f.startsWith('a.json.corrupt-'));
    expect(aside).toHaveLength(1);
    expect(readFileSync(join(dir, aside[0]!), 'utf8')).toBe('[{"half": ');
    expect(existsSync(path)).toBe(false);
  });

  it('throws on I/O errors other than a missing file', () => {
    const path = join(dir, 'is-a-dir.json');
    mkdirSync(path);
    const store = new FileStore({ path, defaultValue: null });
    expect(() => store.read()).toThrow();
  });
});
