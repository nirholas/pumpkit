import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { startHealthServer, stopHealthServer } from '../health.js';

describe('health server', () => {
  const TEST_PORT = 19876;

  beforeEach(() => {
    process.env.HEALTH_PORT = String(TEST_PORT);
  });

  afterEach(async () => {
    await stopHealthServer();
    delete process.env.HEALTH_PORT;
  });

  it('responds with 200 and status ok on GET /health', async () => {
    const startedAt = Date.now();
    startHealthServer({ startedAt });

    // Give server time to bind
    await new Promise((r) => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${TEST_PORT}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.uptimeMs).toBeGreaterThanOrEqual(0);
  });

  it('includes dynamic stats in response', async () => {
    const startedAt = Date.now();
    startHealthServer({
      startedAt,
      getStats: () => ({ claimsDetected: 42, mode: 'poll' }),
    });

    await new Promise((r) => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${TEST_PORT}/health`);
    const body = await res.json();
    expect(body.claimsDetected).toBe(42);
    expect(body.mode).toBe('poll');
  });

  it('responds with 503 when degraded', async () => {
    const startedAt = Date.now();
    startHealthServer({
      startedAt,
      getStats: () => ({ degraded: true }),
    });

    await new Promise((r) => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${TEST_PORT}/health`);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('degraded');
  });

  it('returns 404 for unknown paths', async () => {
    startHealthServer({ startedAt: Date.now() });
    await new Promise((r) => setTimeout(r, 100));

    const res = await fetch(`http://localhost:${TEST_PORT}/unknown`);
    expect(res.status).toBe(404);
  });

  it('stopHealthServer is safe to call multiple times', async () => {
    startHealthServer({ startedAt: Date.now() });
    await new Promise((r) => setTimeout(r, 100));
    await stopHealthServer();
    await stopHealthServer(); // should not throw
  });
});
