// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas

import { describe, expect, it } from 'vitest';

import { formatGraduationNotification, formatTokenPrice } from '../formatters.js';
import type { PumpTokenInfo } from '../pump-client.js';
import type { GraduationEvent } from '../types.js';

const MINT = '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R';
const CREATOR = '7xKpR3nRm4qZ5bN2cW8dF1eG9hJkLmNoPqRsTuVwXyZa';

function token(overrides: Partial<PumpTokenInfo> = {}): PumpTokenInfo {
    return {
        mint: MINT, name: 'Kitty', symbol: 'KIT', description: '', imageUri: '', creator: CREATOR,
        createdTimestamp: 1_790_000_000, bondingCurve: MINT, complete: false,
        virtualSolReserves: 30_000_000_000n, virtualTokenReserves: 1_000_000_000_000_000n,
        totalSupply: 1_000_000_000_000_000n, usdMarketCap: 5_000, marketCapSol: 30, priceSol: 0.00000003,
        curveProgress: 12.5, stage: 'new',
        ...overrides,
    };
}

describe('formatTokenPrice()', () => {
    it('escapes the token name and symbol', () => {
        const html = formatTokenPrice(token({ name: '<b>Free</b>', symbol: 'A&B' }));
        expect(html).toContain('&lt;b&gt;Free&lt;/b&gt;');
        expect(html).toContain('A&amp;B');
    });

    it('cannot be broken out of an href by a social link', () => {
        const html = formatTokenPrice(token({ twitter: 'https://x.com/a"><a href="https://phish.example">' }));
        expect(html).not.toContain('<a href="https://phish.example">');
        expect(html).toContain('<a href="https://x.com/a%22%3E%3Ca%20href=%22https://phish.example%22%3E">Twitter</a>');
    });

    it('drops social links that are not http(s)', () => {
        const html = formatTokenPrice(token({ website: 'javascript:alert(1)', telegram: 'https://t.me/kitty' }));
        expect(html).not.toContain('javascript:');
        expect(html).toContain('<a href="https://t.me/kitty">Telegram</a>');
    });
});

describe('formatGraduationNotification()', () => {
    const event: GraduationEvent = {
        txSignature: 'sig', slot: 1, timestamp: 1_790_000_600, mintAddress: MINT, user: CREATOR,
        bondingCurve: MINT, isMigration: true,
    };

    it('escapes metadata and drops a non-http website', () => {
        const html = formatGraduationNotification(event, token({ name: '<i>x</i>', website: 'data:text/html,hi' }));
        expect(html).toContain('&lt;i&gt;x&lt;/i&gt;');
        expect(html).not.toContain('data:text/html');
    });
});
