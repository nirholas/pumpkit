// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

/**
 * PumpFun API — Webhook Dispatcher
 *
 * Delivers claim events to registered webhook URLs with retry logic.
 * Uses exponential backoff, HMAC-SHA256 payload signing, and concurrent delivery.
 *
 * Receivers can verify webhooks by:
 *   1. Read the `X-PumpFun-Signature` header
 *   2. HMAC-SHA256 the raw body with WEBHOOK_SECRET
 *   3. Compare using timingSafeEqual
 */

import { createHmac } from 'node:crypto';
import { fetchPublic, UnsafeUrlError } from '@pumpkit/core/http';
import { log } from '@pumpkit/core/logger';
import type { FeeClaimEvent } from '../types.js';
import type { ApiWatchEntry, ClaimResponse } from './types.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
/**
 * Webhook URLs are supplied by API clients, so by default they may only
 * resolve to public addresses. Set WEBHOOK_ALLOW_PRIVATE=true when every API
 * client is trusted and webhooks target your own network.
 */
const WEBHOOK_ALLOW_PRIVATE = process.env.WEBHOOK_ALLOW_PRIVATE === 'true';
const WEBHOOK_TIMEOUT_MS = 10_000;

/** Webhook URLs often embed a secret in the path or query; log only the origin. */
export function webhookOrigin(url: string): string {
    try {
        return new URL(url).origin;
    } catch {
        return '<invalid url>';
    }
}

/** Dispatch a claim event to all matching webhook URLs. */
export async function dispatchWebhooks(
    claim: ClaimResponse,
    watches: ApiWatchEntry[],
): Promise<void> {
    const webhookWatches = watches.filter((w) => w.webhookUrl);
    if (webhookWatches.length === 0) return;

    // Deduplicate webhook URLs (multiple watches might share the same URL)
    const uniqueUrls = new Map<string, ApiWatchEntry[]>();
    for (const watch of webhookWatches) {
        const url = watch.webhookUrl!;
        const existing = uniqueUrls.get(url) || [];
        existing.push(watch);
        uniqueUrls.set(url, existing);
    }

    const deliveries = Array.from(uniqueUrls.entries()).map(
        ([url, relatedWatches]) =>
            deliverWithRetry(url, {
                event: 'claim.detected',
                data: claim,
                watchIds: relatedWatches.map((w) => w.id),
                timestamp: new Date().toISOString(),
            }),
    );

    // Fire-and-forget — don't block the main flow
    await Promise.allSettled(deliveries);
}

async function deliverWithRetry(
    url: string,
    payload: unknown,
    attempt = 0,
): Promise<void> {
    try {
        const body = JSON.stringify(payload);

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': 'PumpFun-API/1.0',
            'X-PumpFun-Event': 'claim.detected',
            'X-PumpFun-Timestamp': Date.now().toString(),
        };

        // HMAC-SHA256 signature so receivers can verify authenticity
        if (WEBHOOK_SECRET) {
            const sig = createHmac('sha256', WEBHOOK_SECRET)
                .update(body)
                .digest('hex');
            headers['X-PumpFun-Signature'] = `sha256=${sig}`;
        }

        const response = await fetchPublic(url, {
            method: 'POST',
            headers,
            body,
            timeoutMs: WEBHOOK_TIMEOUT_MS,
            maxBytes: 64 * 1024,
            allowPrivateNetwork: WEBHOOK_ALLOW_PRIVATE,
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        log.debug('Webhook delivered to %s', webhookOrigin(url));
    } catch (err) {
        if (err instanceof UnsafeUrlError) {
            log.warn('Webhook to %s refused: %s', webhookOrigin(url), err.message);
            return;
        }
        if (attempt < MAX_RETRIES) {
            const delay = BASE_DELAY_MS * 2 ** attempt;
            log.warn(
                'Webhook to %s failed (attempt %d/%d), retrying in %dms: %s',
                webhookOrigin(url),
                attempt + 1,
                MAX_RETRIES,
                delay,
                err,
            );
            await new Promise((r) => setTimeout(r, delay));
            return deliverWithRetry(url, payload, attempt + 1);
        }
        log.error('Webhook to %s failed after %d retries: %s', webhookOrigin(url), MAX_RETRIES, err);
    }
}

