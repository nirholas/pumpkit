// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas

import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { formatClaimNotification } from '../formatters.js';
import type { TokenInfo } from '../pump-client.js';
import type { FeeClaimEvent, TrackedItem } from '../types.js';

type Store = typeof import('../store.js');

let dataDir: string;

/** store.ts reads DATA_DIR and keeps state at module scope, so load a fresh copy per test. */
async function loadStore(): Promise<Store> {
    vi.resetModules();
    process.env.DATA_DIR = dataDir;
    return import('../store.js');
}

beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'pumpkit-claim-'));
});

describe('tracked item store', () => {
    it('persists items and reloads them', async () => {
        const first = await loadStore();
        first.loadTracked();
        first.addTrackedItem(1, 10, 'token', 'MintA', 'mine');
        first.addTrackedItem(1, 10, 'xhandle', 'pumpdev');
        expect(first.isAlreadyTracked('MintA', 1)).toBe(true);

        const second = await loadStore();
        second.loadTracked();
        expect(second.getTrackedForChat(1).map((i) => i.value).sort()).toEqual(['MintA', 'pumpdev']);
        expect(second.findMatchingTokenTracks('MintA')).toHaveLength(1);
    });

    it('keeps a corrupt data file instead of overwriting it on the next save', async () => {
        writeFileSync(join(dataDir, 'tracked.json'), '[{"id": "t_1", "va');
        const store = await loadStore();
        store.loadTracked();
        expect(store.getTrackedForChat(1)).toEqual([]);
        store.addTrackedItem(1, 10, 'token', 'MintB');
        expect(readdirSync(dataDir).some((f) => f.startsWith('tracked.json.corrupt-'))).toBe(true);
    });
});

describe('formatClaimNotification()', () => {
    const event: FeeClaimEvent = {
        txSignature: 'sig', slot: 1, timestamp: 1_790_000_000, claimerWallet: '7xKpR3nRm4qZ5bN2cW8dF1eG9hJkLmNoPq',
        tokenMint: 'MintA', amountSol: 1.5, amountLamports: 1_500_000_000, claimType: 'collect_creator_fee',
        isCashback: false, programId: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', claimLabel: 'Creator Fee',
    };
    const item: TrackedItem = { id: 't_1', chatId: 1, addedBy: 10, type: 'token', value: 'MintA', label: '<b>x</b>' } as TrackedItem;
    const token: TokenInfo = {
        mint: 'MintA', name: '<a href="https://phish">Free</a>', symbol: 'A&B', description: '', imageUri: '',
        creator: 'C', complete: false, usdMarketCap: 0, marketCapSol: 0,
    };

    it('escapes the token name, symbol and the user label', () => {
        const html = formatClaimNotification(event, item, token);
        expect(html).not.toContain('<a href="https://phish">');
        expect(html).toContain('&lt;a href=&quot;https://phish&quot;&gt;Free&lt;/a&gt;');
        expect(html).toContain('A&amp;B');
        expect(html).toContain('(&lt;b&gt;x&lt;/b&gt;)');
        expect(html).toContain('1.5000 SOL');
    });
});
