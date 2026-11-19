// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

/**
 * @pumpkit/core — File-Based JSON Store
 *
 * Generic JSON file persistence with atomic writes. A file that exists but
 * cannot be parsed is moved aside (`<path>.corrupt-<ms>`) rather than read
 * as empty, so the next write cannot silently replace the user's data.
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { log } from '../logger.js';
import type { Store } from './types.js';

export interface FileStoreOptions<T> {
  /** Path to the JSON file */
  path: string;
  /** Default value returned when file doesn't exist */
  defaultValue: T;
}

export class FileStore<T> implements Store<T> {
  private readonly filePath: string;
  private readonly defaultValue: T;

  constructor(options: FileStoreOptions<T>) {
    this.filePath = resolve(options.path);
    this.defaultValue = options.defaultValue;
    // Ensure directory exists
    mkdirSync(dirname(this.filePath), { recursive: true });
  }

  /**
   * Read the stored value. Returns `defaultValue` when the file does not
   * exist, or when it is corrupt (after moving it aside). Other I/O errors
   * (permissions, a directory in the way) are thrown.
   */
  read(): T {
    let raw: string;
    try {
      raw = readFileSync(this.filePath, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return this.defaultValue;
      throw err;
    }
    try {
      return JSON.parse(raw) as T;
    } catch (err) {
      const aside = `${this.filePath}.corrupt-${Date.now()}`;
      renameSync(this.filePath, aside);
      log.warn('FileStore: %s is not valid JSON (%s); moved it to %s', this.filePath, err, aside);
      return this.defaultValue;
    }
  }

  /** Write data to file atomically (write to tmp, then rename). */
  write(data: T): void {
    const tmp = this.filePath + '.tmp';
    writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    renameSync(tmp, this.filePath);
  }
}
