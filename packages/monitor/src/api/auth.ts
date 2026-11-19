// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas

/**
 * PumpFun API — API key authentication
 *
 * Keys are compared as SHA-256 digests with `timingSafeEqual`, so response
 * time does not reveal how much of a guessed key matched. A client's ID is
 * derived from the digest, so watches are namespaced per key without storing
 * the key itself.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

/** Client ID used for every request when no API keys are configured. */
export const ANONYMOUS_CLIENT_ID = 'default';

function digest(key: string): Buffer {
    return createHash('sha256').update(key, 'utf8').digest();
}

/** Stable, non-reversible client ID for an API key. */
export function clientIdForKey(key: string): string {
    return `client_${digest(key).toString('hex').slice(0, 24)}`;
}

/**
 * The 32-bit string hash client IDs were derived from before. Two keys could
 * share one, which gave both clients each other's watches. Kept only so
 * persisted watches can be moved to the new IDs.
 */
export function legacyClientIdForKey(key: string): string {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    }
    return `client_${Math.abs(hash).toString(36)}`;
}

/** Pull the presented key from `X-API-Key` or `Authorization: Bearer`. */
export function presentedKey(headers: IncomingHttpHeaders): string | null {
    const header = headers['x-api-key'];
    const apiKey = Array.isArray(header) ? header[0] : header;
    if (apiKey) return apiKey;
    const auth = headers.authorization;
    if (auth?.startsWith('Bearer ')) return auth.slice(7).trim() || null;
    return null;
}

/**
 * Resolve the client ID for a request, or `null` when it is not authorised.
 * With no keys configured every request is the anonymous client.
 */
export function authenticate(headers: IncomingHttpHeaders, apiKeys: readonly string[]): string | null {
    if (apiKeys.length === 0) return ANONYMOUS_CLIENT_ID;
    const key = presentedKey(headers);
    if (!key) return null;
    const presented = digest(key);
    let matched: string | null = null;
    for (const candidate of apiKeys) {
        // Check every key so timing does not reveal which one matched.
        if (timingSafeEqual(presented, digest(candidate)) && matched === null) matched = candidate;
    }
    return matched === null ? null : clientIdForKey(matched);
}
