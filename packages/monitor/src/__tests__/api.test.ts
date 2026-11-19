// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas

import { afterEach, describe, expect, it } from 'vitest';

import {
    ANONYMOUS_CLIENT_ID,
    authenticate,
    clientIdForKey,
    legacyClientIdForKey,
    presentedKey,
} from '../api/auth.js';
import { RateLimiter } from '../api/rateLimiter.js';
import { dispatchWebhooks, webhookOrigin } from '../api/webhooks.js';
import type { ApiConfig, ApiWatchEntry, ClaimResponse } from '../api/types.js';

describe('API key authentication', () => {
    const keys = ['sk_live_alpha', 'sk_live_beta'];

    it('treats every request as the anonymous client when no keys are configured', () => {
        expect(authenticate({}, [])).toBe(ANONYMOUS_CLIENT_ID);
    });

    it('accepts a configured key from X-API-Key or a Bearer token', () => {
        expect(authenticate({ 'x-api-key': 'sk_live_alpha' }, keys)).toBe(clientIdForKey('sk_live_alpha'));
        expect(authenticate({ authorization: 'Bearer sk_live_beta' }, keys)).toBe(clientIdForKey('sk_live_beta'));
    });

    it('rejects a missing, wrong or truncated key', () => {
        expect(authenticate({}, keys)).toBeNull();
        expect(authenticate({ 'x-api-key': 'sk_live_gamma' }, keys)).toBeNull();
        expect(authenticate({ 'x-api-key': 'sk_live_alph' }, keys)).toBeNull();
        expect(authenticate({ authorization: 'Bearer ' }, keys)).toBeNull();
    });

    it('gives keys that collided under the legacy hash distinct client IDs', () => {
        // "Aa" and "BB" have the same 31-multiplier string hash.
        expect(legacyClientIdForKey('Aa')).toBe(legacyClientIdForKey('BB'));
        expect(clientIdForKey('Aa')).not.toBe(clientIdForKey('BB'));
    });

    it('does not embed the key in the client ID', () => {
        expect(clientIdForKey('sk_live_alpha')).not.toContain('alpha');
        expect(clientIdForKey('sk_live_alpha')).toMatch(/^client_[0-9a-f]{24}$/);
    });

    it('reads the first X-API-Key value when the header repeats', () => {
        expect(presentedKey({ 'x-api-key': ['a', 'b'] as unknown as string })).toBe('a');
    });
});

describe('RateLimiter', () => {
    const limiters: RateLimiter[] = [];
    afterEach(() => {
        for (const l of limiters.splice(0)) l.stop();
    });

    const config = (max: number): ApiConfig => ({
        apiKeys: [], claimBufferSize: 10, corsOrigins: '*', maxWatchesPerClient: 10, port: 0,
        rateLimitMax: max, rateLimitWindowMs: 60_000,
    });

    it('allows up to the limit per client, then refuses', () => {
        const limiter = new RateLimiter(config(2));
        limiters.push(limiter);
        expect(limiter.check('a')).toMatchObject({ allowed: true, remaining: 1 });
        expect(limiter.check('a')).toMatchObject({ allowed: true, remaining: 0 });
        const third = limiter.check('a');
        expect(third.allowed).toBe(false);
        expect(third.resetMs).toBeGreaterThan(0);
        expect(limiter.check('b').allowed).toBe(true);
    });
});

describe('webhooks', () => {
    it('logs only the origin of a webhook URL', () => {
        expect(webhookOrigin('https://discord.com/api/webhooks/123/SECRET_TOKEN?x=1')).toBe('https://discord.com');
        expect(webhookOrigin('not a url')).toBe('<invalid url>');
    });

    it('refuses a private webhook target without retrying', async () => {
        const claim = { txSignature: 'sig' } as ClaimResponse;
        const watch = { id: 'w1', webhookUrl: 'http://169.254.169.254/latest/meta-data/' } as ApiWatchEntry;
        const started = Date.now();
        await dispatchWebhooks(claim, [watch]);
        // A retried failure would wait 1s + 2s + 4s before giving up.
        expect(Date.now() - started).toBeLessThan(900);
    });
});
