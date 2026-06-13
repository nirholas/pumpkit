// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onShutdown, installShutdownHandlers } from '../shutdown.js';

describe('shutdown', () => {
  // Note: We can't fully test process.exit in unit tests, but we can
  // test handler registration and execution patterns.

  it('onShutdown accepts a handler without throwing', () => {
    expect(() => onShutdown(() => {})).not.toThrow();
  });

  it('onShutdown accepts async handlers', () => {
    expect(() => onShutdown(async () => {})).not.toThrow();
  });

  it('installShutdownHandlers does not throw', () => {
    expect(() => installShutdownHandlers()).not.toThrow();
  });
});
