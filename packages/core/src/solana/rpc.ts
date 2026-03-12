/**
 * @pumpkit/core — Solana RPC Connection Factory
 *
 * Creates Solana connections with fallback URL rotation
 * extracted from channel-bot's rpc-fallback.ts pattern.
 */

import { Connection, type Commitment } from '@solana/web3.js';
import { log } from '../logger.js';

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

/**
 * Mask an RPC URL for safe logging (hide API keys).
 */
function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.pathname.length > 10) {
      return `${u.protocol}//${u.host}/${u.pathname.slice(1, 8)}…`;
    }
    return `${u.protocol}//${u.host}`;
  } catch {
    return url.slice(0, 20) + '…';
  }
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

  /** Execute a function with automatic fallback rotation on failure. */
  async withFallback<T>(fn: (connection: Connection) => Promise<T>): Promise<T> {
    const tried = new Set<number>();
    while (tried.size < this.urls.length) {
      // Skip endpoints in cooldown
      if (this.cooldownUntil[this.currentIndex]! > Date.now()) {
        this.rotate();
        if (tried.has(this.currentIndex)) break;
        continue;
      }
      tried.add(this.currentIndex);

      try {
        const result = await fn(this.getConnection());
        this.reportSuccess();
        return result;
      } catch (err) {
        const msg = String(err);
        const retryable =
          msg.includes('429') ||
          msg.includes('502') ||
          msg.includes('503') ||
          msg.includes('504') ||
          msg.includes('ETIMEDOUT') ||
          msg.includes('ECONNREFUSED') ||
          msg.includes('ECONNRESET') ||
          msg.includes('fetch failed');

        if (retryable && !msg.includes('403')) {
          log.warn('RPC error on %s, rotating: %s', maskUrl(this.urls[this.currentIndex]!), msg.slice(0, 100));
          this.reportFailure();
        } else {
          throw err;
        }
      }
    }
    throw new Error('All RPC endpoints exhausted');
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
