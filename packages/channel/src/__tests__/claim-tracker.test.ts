// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas

import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Tracker = typeof import('../claim-tracker.js');

let dataDir: string;

/** claim-tracker reads DATA_DIR and keeps its state at module scope, so load a fresh copy per test. */
async function loadTracker(): Promise<Tracker> {
    vi.resetModules();
    process.env.DATA_DIR = dataDir;
    return import('../claim-tracker.js');
}

beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'pumpkit-claims-'));
});

describe('claim tracker persistence', () => {
    it('round-trips GitHub user+token pairs and claim counts', async () => {
        const first = await loadTracker();
        first.loadPersistedClaims();
        expect(first.hasGithubUserClaimed('42', 'MintA')).toBe(false);
        first.markGithubUserClaimed('42', 'MintA');
        first.markGithubUserClaimed('42', 'MintB');
        expect(first.incrementGithubClaimCount('42', 'MintA')).toBe(1);
        expect(first.incrementGithubClaimCount('42', 'MintA')).toBe(2);
        first.persistClaimsNow();

        const second = await loadTracker();
        second.loadPersistedClaims();
        expect(second.hasGithubUserClaimed('42', 'MintA')).toBe(true);
        expect(second.hasGithubUserClaimed('42', 'MintC')).toBe(false);
        expect(second.getGithubUserClaimedMints('42').sort()).toEqual(['MintA', 'MintB']);
        expect(second.getGithubClaimCount('42', 'MintA')).toBe(2);
    });

    it('reads pairs that older releases wrote to github-first-claims.json', async () => {
        writeFileSync(join(dataDir, 'github-first-claims.json'), JSON.stringify(['7:MintOld']));
        const tracker = await loadTracker();
        tracker.loadPersistedClaims();
        expect(tracker.hasGithubUserClaimed('7', 'MintOld')).toBe(true);
        tracker.persistClaimsNow();
        const saved: unknown = JSON.parse(readFileSync(join(dataDir, 'github-user-token-claims.json'), 'utf8'));
        expect(saved).toEqual(['7:MintOld']);
    });

    it('keeps loading the other files when one is corrupt', async () => {
        writeFileSync(join(dataDir, 'first-claims.json'), '{not json');
        writeFileSync(join(dataDir, 'wallet-first-claims.json'), JSON.stringify(['Wallet1']));
        const tracker = await loadTracker();
        tracker.loadPersistedClaims();
        expect(tracker.isFirstClaimByWallet('Wallet1')).toBe(false);
        expect(tracker.isFirstClaimByWallet('Wallet2')).toBe(true);
    });

    it('writes atomically, leaving no temp file behind', async () => {
        const tracker = await loadTracker();
        tracker.loadPersistedClaims();
        tracker.isFirstClaimOnToken('MintZ');
        tracker.persistClaimsNow();
        expect(JSON.parse(readFileSync(join(dataDir, 'first-claims.json'), 'utf8'))).toEqual(['MintZ']);
        expect(existsSync(join(dataDir, 'first-claims.json.tmp'))).toBe(false);
    });
});
