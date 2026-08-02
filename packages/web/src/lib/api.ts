// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

/**
 * @pumpkit/web — API Client
 *
 * Functions for interacting with the @pumpkit/monitor REST API.
 */

import type { ClaimEvent, HealthResponse, PaginatedResponse, WatchResponse } from './types.js';

const LOCAL_MONITOR_URL = 'http://localhost:3000';
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/**
 * Where the monitor bot lives, or '' when there is none.
 *
 * `VITE_API_URL` wins. Failing that, a page served from localhost assumes a bot
 * on the default port, which is what `npm run dev` gives you. A page served from
 * anywhere else assumes nothing: probing a visitor's own localhost from a public
 * deployment fails on every poll and is not ours to do.
 */
function resolveBaseUrl(): string {
    const configured = import.meta.env.VITE_API_URL;
    if (configured) return configured.replace(/\/+$/, '');
    if (typeof window !== 'undefined' && LOCAL_HOSTS.includes(window.location.hostname)) {
        return LOCAL_MONITOR_URL;
    }
    return '';
}

/** Base URL of the monitor bot API. Empty string means no bot is reachable. */
export const MONITOR_BASE_URL: string = resolveBaseUrl();

/** True when a monitor bot API is configured and worth calling. */
export const isMonitorConfigured: boolean = MONITOR_BASE_URL !== '';

function getBaseUrl(): string {
    if (!MONITOR_BASE_URL) {
        throw new Error('No monitor bot configured. Set VITE_API_URL to your bot API.');
    }
    return MONITOR_BASE_URL;
}

// ── Health ──────────────────────────────────────────────────────────

export async function fetchHealth(): Promise<HealthResponse> {
    const res = await fetch(`${getBaseUrl()}/api/v1/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
    return res.json();
}

// ── Watches ─────────────────────────────────────────────────────────

export async function fetchWatches(): Promise<WatchResponse[]> {
    const res = await fetch(`${getBaseUrl()}/api/v1/watches`);
    if (!res.ok) throw new Error(`Failed to fetch watches: ${res.status}`);
    return res.json();
}

export async function addWatch(address: string, label?: string): Promise<WatchResponse> {
    const res = await fetch(`${getBaseUrl()}/api/v1/watches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address, label }),
    });
    if (!res.ok) throw new Error(`Failed to add watch: ${res.status}`);
    return res.json();
}

export async function removeWatch(address: string): Promise<void> {
    const res = await fetch(`${getBaseUrl()}/api/v1/watches/${encodeURIComponent(address)}`, {
        method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to remove watch: ${res.status}`);
}

// ── Claims ──────────────────────────────────────────────────────────

export async function fetchClaims(page = 1, limit = 50): Promise<PaginatedResponse<ClaimEvent>> {
    const url = new URL(`${getBaseUrl()}/api/v1/claims`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(limit));
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch claims: ${res.status}`);
    return res.json();
}

// ── SSE Stream ──────────────────────────────────────────────────────

export function createClaimStream(onEvent: (event: ClaimEvent) => void): EventSource {
    const source = new EventSource(`${getBaseUrl()}/api/v1/claims/stream`);

    source.onmessage = (msg) => {
        try {
            const event = JSON.parse(msg.data) as ClaimEvent;
            onEvent(event);
        } catch {
            console.warn('Failed to parse SSE event:', msg.data);
        }
    };

    source.onerror = () => {
        console.warn('SSE connection error — will auto-reconnect');
    };

    return source;
}
