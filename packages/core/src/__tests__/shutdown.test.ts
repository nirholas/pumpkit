// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Shutdown = typeof import('../shutdown.js');

/** The handler list is module state, so give each test a fresh copy. */
async function load(): Promise<Shutdown> {
  vi.resetModules();
  return import('../shutdown.js');
}

describe('shutdown', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('runs handlers in registration order, awaiting async ones', async () => {
    const { onShutdown, runShutdownHandlers } = await load();
    const order: string[] = [];
    onShutdown(async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push('a');
    });
    onShutdown(() => {
      order.push('b');
    });
    await runShutdownHandlers();
    expect(order).toEqual(['a', 'b']);
  });

  it('keeps going after a handler throws or rejects', async () => {
    const { onShutdown, runShutdownHandlers } = await load();
    const ran: string[] = [];
    onShutdown(() => {
      throw new Error('sync boom');
    });
    onShutdown(async () => {
      throw new Error('async boom');
    });
    onShutdown(() => {
      ran.push('last');
    });
    await runShutdownHandlers();
    expect(ran).toEqual(['last']);
  });

  it('gives up on a handler that hangs', async () => {
    const { onShutdown, runShutdownHandlers } = await load();
    const ran: string[] = [];
    onShutdown(() => new Promise<void>(() => undefined));
    onShutdown(() => {
      ran.push('after');
    });
    const started = Date.now();
    await runShutdownHandlers(50);
    expect(ran).toEqual(['after']);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('installs the signal listeners only once', async () => {
    const { installShutdownHandlers } = await load();
    const on = vi.spyOn(process, 'on').mockImplementation(() => process);
    installShutdownHandlers();
    installShutdownHandlers();
    expect(on.mock.calls.filter(([event]) => event === 'SIGINT')).toHaveLength(1);
    expect(on.mock.calls.filter(([event]) => event === 'SIGTERM')).toHaveLength(1);
  });
});
