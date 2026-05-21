import { describe, it, expect, vi } from 'vitest';
import {
  retry,
  isTransientError,
  computeBackoffDelay,
} from '../util/retry.js';

describe('isTransientError', () => {
  it.each([
    ['429 Too Many Requests'],
    ['502 Bad Gateway'],
    ['503 Service Unavailable'],
    ['504 Gateway Timeout'],
    ['408 Request Timeout'],
    ['ETIMEDOUT connecting to host'],
    ['ECONNREFUSED 1.2.3.4:443'],
    ['ECONNRESET'],
    ['fetch failed'],
    ['socket hang up'],
    ['rate limit exceeded'],
    ['request timeout'],
  ])('classifies %s as transient', (msg) => {
    expect(isTransientError(new Error(msg))).toBe(true);
  });

  it.each([
    ['400 Bad Request'],
    ['401 Unauthorized'],
    ['403 Forbidden'],
    ['404 Not Found'],
    ['Invalid input: missing field'],
    ['TypeError: undefined is not a function'],
  ])('classifies %s as non-transient', (msg) => {
    expect(isTransientError(new Error(msg))).toBe(false);
  });

  it('handles non-Error throws', () => {
    expect(isTransientError('429 too many')).toBe(true);
    expect(isTransientError('whatever')).toBe(false);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });
});

describe('computeBackoffDelay', () => {
  const opts = {
    initialDelayMs: 100,
    maxDelayMs: 1000,
    backoffFactor: 2,
    jitter: false as const,
  };

  it('doubles each attempt without jitter', () => {
    expect(computeBackoffDelay(1, opts)).toBe(100);
    expect(computeBackoffDelay(2, opts)).toBe(200);
    expect(computeBackoffDelay(3, opts)).toBe(400);
    expect(computeBackoffDelay(4, opts)).toBe(800);
  });

  it('clamps at maxDelayMs', () => {
    expect(computeBackoffDelay(10, opts)).toBe(1000);
    expect(computeBackoffDelay(100, opts)).toBe(1000);
  });

  it('respects custom backoffFactor', () => {
    expect(computeBackoffDelay(2, { ...opts, backoffFactor: 3 })).toBe(300);
    expect(computeBackoffDelay(3, { ...opts, backoffFactor: 3 })).toBe(900);
  });

  it('applies jitter within ±50% of the base delay', () => {
    const jitteredOpts = { ...opts, jitter: true as const };
    for (let i = 0; i < 50; i++) {
      const d = computeBackoffDelay(2, jitteredOpts);
      // base is 200, jitter is ±50% so range is [100, 300]
      expect(d).toBeGreaterThanOrEqual(100);
      expect(d).toBeLessThanOrEqual(300);
    }
  });

  it('never exceeds maxDelayMs even with jitter', () => {
    const jitteredOpts = { ...opts, jitter: true as const };
    for (let i = 0; i < 50; i++) {
      expect(computeBackoffDelay(10, jitteredOpts)).toBeLessThanOrEqual(1000);
    }
  });
});

describe('retry', () => {
  it('returns the resolved value on first success', async () => {
    const fn = vi.fn(async () => 'ok');
    const result = await retry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on transient errors and eventually succeeds', async () => {
    let calls = 0;
    const result = await retry(
      async () => {
        calls++;
        if (calls < 3) throw new Error('429 rate limited');
        return 'ok';
      },
      { initialDelayMs: 1, maxDelayMs: 5, jitter: false },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('throws immediately on non-retryable errors', async () => {
    let calls = 0;
    await expect(
      retry(
        async () => {
          calls++;
          throw new Error('403 Forbidden');
        },
        { initialDelayMs: 1, jitter: false },
      ),
    ).rejects.toThrow(/403/);
    expect(calls).toBe(1);
  });

  it('throws the last error after exhausting attempts', async () => {
    let calls = 0;
    await expect(
      retry(
        async () => {
          calls++;
          throw new Error(`502 attempt ${calls}`);
        },
        { maxAttempts: 3, initialDelayMs: 1, jitter: false },
      ),
    ).rejects.toThrow(/502 attempt 3/);
    expect(calls).toBe(3);
  });

  it('invokes onRetry hook with diagnostic info', async () => {
    const events: Array<{ attempt: number; delayMs: number }> = [];
    let calls = 0;
    await retry(
      async () => {
        calls++;
        if (calls < 3) throw new Error('503');
        return 'ok';
      },
      {
        maxAttempts: 5,
        initialDelayMs: 1,
        maxDelayMs: 5,
        jitter: false,
        onRetry: (e) => events.push({ attempt: e.attempt, delayMs: e.delayMs }),
      },
    );
    expect(events.length).toBe(2);
    expect(events[0]?.attempt).toBe(1);
    expect(events[1]?.attempt).toBe(2);
  });

  it('aborts when signal is already fired', async () => {
    const ctrl = new AbortController();
    ctrl.abort(new Error('user cancelled'));
    await expect(
      retry(async () => 'ok', { signal: ctrl.signal }),
    ).rejects.toThrow(/cancelled/);
  });

  it('aborts mid-backoff when signal fires', async () => {
    const ctrl = new AbortController();
    const promise = retry(
      async () => {
        throw new Error('429');
      },
      {
        maxAttempts: 10,
        initialDelayMs: 100,
        maxDelayMs: 100,
        jitter: false,
        signal: ctrl.signal,
      },
    );
    setTimeout(() => ctrl.abort(new Error('cancelled')), 20);
    await expect(promise).rejects.toThrow(/cancelled/);
  });

  it('supports custom shouldRetry predicate', async () => {
    let calls = 0;
    const result = await retry(
      async () => {
        calls++;
        if (calls < 2) throw new Error('NOT_FOUND');
        return 'ok';
      },
      {
        initialDelayMs: 1,
        jitter: false,
        shouldRetry: (err) => err instanceof Error && err.message === 'NOT_FOUND',
      },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(2);
  });

  it('rejects when maxAttempts < 1', async () => {
    await expect(retry(async () => 'ok', { maxAttempts: 0 })).rejects.toThrow(/maxAttempts/);
  });

  it('passes the attempt number to fn', async () => {
    const seen: number[] = [];
    await retry(
      async (attempt) => {
        seen.push(attempt);
        if (attempt < 3) throw new Error('429');
        return 'ok';
      },
      { initialDelayMs: 1, jitter: false },
    );
    expect(seen).toEqual([1, 2, 3]);
  });
});
