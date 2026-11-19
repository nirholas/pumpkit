// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas

import type { Connection } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';

import { RpcFallback } from '../solana/rpc.js';

const A = 'https://rpc-a.example.com';
const B = 'https://rpc-b.example.com';

const endpointOf = (conn: Connection) => conn.rpcEndpoint;

describe('RpcFallback.withFallback', () => {
  it('moves to the next endpoint on a transient error', async () => {
    const rpc = new RpcFallback({ url: A, fallbackUrls: [B] });
    const seen: string[] = [];
    const result = await rpc.withFallback(async (conn) => {
      seen.push(endpointOf(conn));
      if (endpointOf(conn) === A) throw new Error('429 Too Many Requests');
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(seen).toEqual([A, B]);
  });

  it('rethrows a non-transient error without trying other endpoints', async () => {
    const rpc = new RpcFallback({ url: A, fallbackUrls: [B] });
    let calls = 0;
    await expect(
      rpc.withFallback(async () => {
        calls++;
        throw new Error('Invalid param: WrongSize');
      }),
    ).rejects.toThrow('WrongSize');
    expect(calls).toBe(1);
  });

  it('tries each endpoint once and reports the last error as the cause', async () => {
    const rpc = new RpcFallback({ url: A, fallbackUrls: [B] });
    let calls = 0;
    const failure = rpc.withFallback(async () => {
      calls++;
      throw new Error('503 Service Unavailable');
    });
    await expect(failure).rejects.toThrow('All RPC endpoints failed');
    await expect(failure).rejects.toMatchObject({ cause: expect.objectContaining({ message: '503 Service Unavailable' }) });
    expect(calls).toBe(2);
  });

  it('keeps serving a single endpoint after it enters cooldown instead of spinning', async () => {
    // Three transient failures put the only endpoint into cooldown. The old
    // implementation then looped forever (synchronously) on the next call.
    const rpc = new RpcFallback({ url: A });
    for (let i = 0; i < 3; i++) {
      await expect(rpc.withFallback(async () => Promise.reject(new Error('429')))).rejects.toThrow();
    }
    await expect(rpc.withFallback(async () => 'recovered')).resolves.toBe('recovered');
  });

  it('uses the endpoint whose cooldown ends first when all are cooling down', async () => {
    const rpc = new RpcFallback({ url: A, fallbackUrls: [B] });
    for (let i = 0; i < 3; i++) {
      await expect(rpc.withFallback(async () => Promise.reject(new Error('502')))).rejects.toThrow();
    }
    const seen: string[] = [];
    await rpc.withFallback(async (conn) => {
      seen.push(endpointOf(conn));
      return null;
    });
    expect(seen).toHaveLength(1);
  });
});
