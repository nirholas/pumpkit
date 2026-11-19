// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas

import { describe, expect, it } from 'vitest';

import * as db from '../db.js';
import { formatCallSimple } from '../formatters.js';
import { mapPairToTokenInfo, parseTokenInput } from '../token-service.js';
import type { TokenInfo } from '../types.js';

describe('parseTokenInput()', () => {
  it('accepts a raw Solana address', () => {
    const address = '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R';
    expect(parseTokenInput(` ${address} `)).toEqual({ address, chain: 'solana' });
  });

  it('accepts a raw EVM address as ethereum', () => {
    const address = '0x' + 'a'.repeat(40);
    expect(parseTokenInput(address)).toEqual({ address, chain: 'ethereum' });
  });

  it('reads chain and address from explorer links', () => {
    expect(parseTokenInput('https://dexscreener.com/base/0xabc123')).toEqual({ address: '0xabc123', chain: 'base' });
    expect(parseTokenInput('https://bscscan.com/token/0xdef456')).toEqual({ address: '0xdef456', chain: 'bsc' });
    expect(parseTokenInput('https://birdeye.so/token/So1ana')).toEqual({ address: 'So1ana', chain: 'solana' });
  });

  it('falls back to solana for an unknown DexScreener chain', () => {
    expect(parseTokenInput('https://dexscreener.com/tron/abc')?.chain).toBe('solana');
  });

  it('rejects free text', () => {
    expect(parseTokenInput('gm everyone')).toBeNull();
  });
});

describe('mapPairToTokenInfo()', () => {
  it('maps a DexScreener pair and tolerates missing fields', () => {
    const info = mapPairToTokenInfo({
      chainId: 'solana',
      baseToken: { address: 'Mint1', name: 'Kitty', symbol: 'KIT' },
      priceUsd: '0.0012',
      fdv: 120_000,
      liquidity: { usd: 5_000 },
    });
    expect(info).toMatchObject({
      address: 'Mint1', chain: 'solana', name: 'Kitty', symbol: 'KIT', price: 0.0012, mcap: 120_000,
      liquidity: 5_000, volume24h: 0, pairAge: null,
    });
    expect(mapPairToTokenInfo({})).toMatchObject({ name: 'Unknown', symbol: '???', mcap: 0 });
  });
});

describe('formatCallSimple()', () => {
  it('escapes names from DexScreener and Telegram', () => {
    const token: TokenInfo = {
      address: 'Mint<1>', chain: 'solana', name: '<a href="x">Kitty</a>', symbol: 'K&T', price: 1, mcap: 1,
      liquidity: 0, volume24h: 0, pairAge: null,
    };
    const html = formatCallSimple(token, 'alpha', '<b>bob</b>');
    expect(html).toContain('&lt;a href="x"&gt;Kitty&lt;/a&gt;');
    expect(html).toContain('K&amp;T');
    expect(html).toContain('&lt;b&gt;bob&lt;/b&gt;');
    expect(html).toContain('<code>Mint&lt;1&gt;</code>');
  });
});

describe('updateGroupSettings()', () => {
  it('stores the hardcore flag, which better-sqlite3 cannot bind as a boolean', () => {
    db.initDb(':memory:');
    db.upsertGroup(-100, 'Callers');
    db.updateGroupSettings(-100, { hardcore_enabled: true, call_mode: 'button' });
    expect(db.getGroup(-100)).toMatchObject({ hardcore_enabled: 1, call_mode: 'button' });
    db.updateGroupSettings(-100, { hardcore_enabled: false });
    expect(db.getGroup(-100)?.hardcore_enabled).toBe(0);
  });
});
