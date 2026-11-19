// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

/**
 * @pumpkit/core — Solana RPC Connection Factory
 *
 * Creates Solana connections with fallback URL rotation
 * extracted from channel-bot's rpc-fallback.ts pattern.
 */

import { Connection, type Commitment } from '@solana/web3.js';
import { log, redactUrl as maskUrl } from '../logger.js';
import { isTransientError } from '../util/retry.js';

export interface RpcOptions {
  /** Primary RPC URL */
  url: string;
  /** Fallback RPC URLs (optional) */
  fallbackUrls?: string[];
  /** Commitment level (default: 'confirmed') */
  commitment?: Commitment;
}

/**
 * Derive a WebSocket URL from an HTTP RPC URL.
 * https → wss, http → ws
 */
export function deriveWsUrl(httpUrl: string): string {
  return httpUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
}


const MAX_CONSECUTIVE_FAILS = 3;
const COOLDOWN_MS = 60_000;

/**
 * RPC connection manager with automatic failover and rotation.
 */
export class RpcFallback {
  private readonly urls: string[];
  private readonly commitment: Commitment;
  private currentIndex = 0;
  private failCounts: number[];
  private cooldownUntil: number[];
  private connections: (Connection | null)[];

  constructor(options: RpcOptions) {
    this.urls = [options.url, ...(options.fallbackUrls ?? [])];
    this.commitment = options.commitment ?? 'confirmed';
    this.failCounts = new Array(this.urls.length).fill(0);
    this.cooldownUntil = new Array(this.urls.length).fill(0);
    this.connections = new Array(this.urls.length).fill(null);
  }

  /** Get the current active connection, creating if needed. */
  getConnection(): Connection {
    if (!this.connections[this.currentIndex]) {
      const url = this.urls[this.currentIndex]!;
      this.connections[this.currentIndex] = new Connection(url, {
        commitment: this.commitment,
        wsEndpoint: deriveWsUrl(url),
      });
    }
    return this.connections[this.currentIndex]!;
  }

  /** Report a successful RPC call — resets fail counter. */
  reportSuccess(): void {
    this.failCounts[this.currentIndex] = 0;
  }

  /** Report a failed RPC call — may trigger rotation. */
  reportFailure(): void {
    this.failCounts[this.currentIndex]!++;
    if (this.failCounts[this.currentIndex]! >= MAX_CONSECUTIVE_FAILS) {
      this.rotate();
    }
  }

  /**
   * Run `fn` against the current endpoint, moving to the next one on a
   * transient error (429, 5xx, timeouts, resets). Each endpoint is tried at
   * most once per call. Endpoints cooling down after repeated failures are
   * skipped; if every endpoint is cooling down, the one whose cooldown ends
   * first is tried anyway, so a single-endpoint setup keeps working.
   * Non-transient errors are rethrown at once.
   */
  async withFallback<T>(fn: (connection: Connection) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (const index of this.attemptOrder()) {
      this.currentIndex = index;
      try {
        const result = await fn(this.getConnection());
        this.reportSuccess();
        return result;
      } catch (err) {
        if (!isTransientError(err)) throw err;
        lastError = err;
        log.warn('RPC error on %s: %s', maskUrl(this.urls[index]!), String(err).slice(0, 100));
        this.reportFailure();
      }
    }
    throw new Error('All RPC endpoints failed', { cause: lastError });
  }

  /** Endpoints to try, starting at the current one, cooled-down ones last. */
  private attemptOrder(): number[] {
    const now = Date.now();
    const order = this.urls.map((_, i) => (this.currentIndex + i) % this.urls.length);
    const ready = order.filter((i) => this.cooldownUntil[i]! <= now);
    const cooling = order
      .filter((i) => this.cooldownUntil[i]! > now)
      .sort((x, y) => this.cooldownUntil[x]! - this.cooldownUntil[y]!);
    return ready.length > 0 ? ready : cooling.slice(0, 1);
  }

  private rotate(): void {
    this.cooldownUntil[this.currentIndex] = Date.now() + COOLDOWN_MS;
    this.connections[this.currentIndex] = null;
    const prev = this.currentIndex;
    this.currentIndex = (this.currentIndex + 1) % this.urls.length;
    this.failCounts[this.currentIndex] = 0;
    if (this.urls.length > 1) {
      log.info('RPC rotated from %s to %s', maskUrl(this.urls[prev]!), maskUrl(this.urls[this.currentIndex]!));
    }
  }
}

/**
 * Create a Solana RPC connection with optional fallback rotation.
 */
export function createRpcConnection(options: RpcOptions): RpcFallback {
  return new RpcFallback(options);
}
