/**
 * @pumpkit/core — Retry with Exponential Backoff
 *
 * General-purpose retry helper used by RPC code, webhook delivery, and
 * external API calls. Sits one level below `RpcFallback` in the stack:
 * `RpcFallback` rotates *between* endpoints, `retry` retries *the same*
 * call with backoff.
 *
 * Design goals:
 *   1. Zero dependencies. Pure TS, no `p-retry` or similar.
 *   2. Pluggable `shouldRetry` predicate so callers control what's retryable.
 *   3. Optional `AbortSignal` for cooperative cancellation.
 *   4. Optional `onRetry` hook for telemetry (logging, metrics).
 *   5. Jitter on by default — prevents thundering-herd retries from
 *      multiple bots hitting the same RPC after a 429.
 */

import { log } from '../logger.js';

export interface RetryOptions {
  /** Maximum total attempts including the first call. Default: 5. */
  maxAttempts?: number;
  /** Initial delay in milliseconds before the first retry. Default: 250. */
  initialDelayMs?: number;
  /** Maximum delay between attempts. Default: 10_000. */
  maxDelayMs?: number;
  /** Backoff multiplier applied to the delay each attempt. Default: 2. */
  backoffFactor?: number;
  /** If true (default), randomize each delay by ±50% to avoid synchronization. */
  jitter?: boolean;
  /**
   * Predicate to decide if an error is retryable. Default classifies common
   * transient HTTP / network failures as retryable, everything else as fatal.
   */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  /** Called before each retry. Useful for logging and metrics. */
  onRetry?: (info: RetryEvent) => void;
  /** Cancellation signal. If aborted, retry stops and the AbortError is thrown. */
  signal?: AbortSignal;
  /** Label for log lines. Default: 'retry'. */
  label?: string;
}

export interface RetryEvent {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  error: unknown;
  label: string;
}

/**
 * Default retryable classifier — matches the same transient errors that
 * `RpcFallback` treats as retryable, plus a few generic HTTP cases.
 */
export function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (!msg) return false;
  if (/\b403\b/.test(msg)) return false;
  if (/\b401\b/.test(msg)) return false;
  return (
    /\b429\b/.test(msg) ||
    /\b50[234]\b/.test(msg) ||
    /\b408\b/.test(msg) ||
    /ETIMEDOUT/.test(msg) ||
    /ECONNREFUSED/.test(msg) ||
    /ECONNRESET/.test(msg) ||
    /EAI_AGAIN/.test(msg) ||
    /fetch failed/i.test(msg) ||
    /socket hang up/i.test(msg) ||
    /network/i.test(msg) ||
    /rate.?limit/i.test(msg) ||
    /timeout/i.test(msg)
  );
}

/** Sleep that resolves early if the signal aborts. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(signal.reason ?? new Error('AbortError'));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(signal!.reason ?? new Error('AbortError'));
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Compute the next delay with optional jitter, clamped to maxDelayMs. */
export function computeBackoffDelay(
  attempt: number,
  opts: Required<Pick<RetryOptions, 'initialDelayMs' | 'maxDelayMs' | 'backoffFactor' | 'jitter'>>,
): number {
  const base = opts.initialDelayMs * Math.pow(opts.backoffFactor, attempt - 1);
  const clamped = Math.min(base, opts.maxDelayMs);
  if (!opts.jitter) return clamped;
  // ±50% jitter — keeps the average at `clamped` while avoiding synchronization.
  const factor = 0.5 + Math.random();
  return Math.min(opts.maxDelayMs, Math.max(0, Math.round(clamped * factor)));
}

/**
 * Execute `fn` with retries. Returns the resolved value of `fn` on success.
 * Throws the last error if all attempts fail or `shouldRetry` returns false.
 *
 * ```ts
 * const tx = await retry(
 *   () => connection.getTransaction(sig, { maxSupportedTransactionVersion: 0 }),
 *   { label: 'getTransaction', maxAttempts: 4 },
 * );
 * ```
 */
export async function retry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const opts = {
    maxAttempts: options.maxAttempts ?? 5,
    initialDelayMs: options.initialDelayMs ?? 250,
    maxDelayMs: options.maxDelayMs ?? 10_000,
    backoffFactor: options.backoffFactor ?? 2,
    jitter: options.jitter ?? true,
    shouldRetry: options.shouldRetry ?? ((err: unknown) => isTransientError(err)),
    onRetry: options.onRetry,
    signal: options.signal,
    label: options.label ?? 'retry',
  };

  if (opts.maxAttempts < 1) {
    throw new Error('retry: maxAttempts must be >= 1');
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    if (opts.signal?.aborted) {
      throw opts.signal.reason ?? new Error('AbortError');
    }
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt >= opts.maxAttempts) break;
      if (!opts.shouldRetry(err, attempt)) break;

      const delayMs = computeBackoffDelay(attempt, opts);
      const event: RetryEvent = {
        attempt,
        maxAttempts: opts.maxAttempts,
        delayMs,
        error: err,
        label: opts.label,
      };
      if (opts.onRetry) {
        opts.onRetry(event);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn(
          '%s: attempt %d/%d failed (%s) — retrying in %dms',
          opts.label,
          attempt,
          opts.maxAttempts,
          msg.slice(0, 120),
          delayMs,
        );
      }
      await sleep(delayMs, opts.signal);
    }
  }

  throw lastErr;
}
