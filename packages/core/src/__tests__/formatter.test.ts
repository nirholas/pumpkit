// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

import { describe, it, expect } from 'vitest';
import {
    link, solscanTx, solscanAccount, pumpFunToken, dexScreenerToken,
    bold, code, italic, shortenAddress, formatSol, formatNumber,
    escapeHtml, safeHttpUrl, formatQuoteAmount, USDC_MINT,
} from '../formatter/links.js';

describe('formatter/links', () => {
    describe('HTML helpers', () => {
        it('link() generates anchor tag', () => {
            expect(link('Click', 'https://example.com')).toBe('<a href="https://example.com">Click</a>');
        });

        it('bold() wraps in <b>', () => {
            expect(bold('hello')).toBe('<b>hello</b>');
        });

        it('code() wraps in <code>', () => {
            expect(code('foo')).toBe('<code>foo</code>');
        });

        it('italic() wraps in <i>', () => {
            expect(italic('bar')).toBe('<i>bar</i>');
        });

        it('escapes markup in every helper', () => {
            expect(bold('<a href="x">pwn</a>')).toBe('<b>&lt;a href=&quot;x&quot;&gt;pwn&lt;/a&gt;</b>');
            expect(code('a & b')).toBe('<code>a &amp; b</code>');
            expect(italic('<i>')).toBe('<i>&lt;i&gt;</i>');
            expect(link('<b>', 'https://e.com/?a=1&b="2"')).toBe(
                '<a href="https://e.com/?a=1&amp;b=&quot;2&quot;">&lt;b&gt;</a>',
            );
        });
    });

    describe('escapeHtml()', () => {
        it('escapes the four characters Telegram HTML treats specially', () => {
            expect(escapeHtml('&<>"')).toBe('&amp;&lt;&gt;&quot;');
        });

        it('leaves other text untouched', () => {
            expect(escapeHtml("PumpKitty 🐱 it's")).toBe("PumpKitty 🐱 it's");
        });
    });

    describe('safeHttpUrl()', () => {
        it('accepts http and https URLs', () => {
            expect(safeHttpUrl('https://x.com/pump')).toBe('https://x.com/pump');
            expect(safeHttpUrl(' http://example.com ')).toBe('http://example.com/');
        });

        it('rejects other schemes and garbage', () => {
            expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
            expect(safeHttpUrl('tg://resolve?domain=x')).toBeNull();
            expect(safeHttpUrl('x.com/pump')).toBeNull();
            expect(safeHttpUrl('')).toBeNull();
        });
    });

    describe('URL generators', () => {
        it('solscanTx() generates correct URL', () => {
            const result = solscanTx('abc123');
            expect(result).toContain('https://solscan.io/tx/abc123');
            expect(result).toContain('View TX');
        });

        it('solscanAccount() generates correct URL', () => {
            const result = solscanAccount('7xKpR3nRm4qZ5bN2cW8dF1eG');
            expect(result).toContain('https://solscan.io/account/7xKpR3nRm4qZ5bN2cW8dF1eG');
        });

        it('pumpFunToken() generates correct URL', () => {
            const result = pumpFunToken('MintABC123');
            expect(result).toContain('https://pump.fun/coin/MintABC123');
            expect(result).toContain('View on PumpFun');
        });

        it('dexScreenerToken() defaults to solana chain', () => {
            const result = dexScreenerToken('MintABC');
            expect(result).toContain('https://dexscreener.com/solana/MintABC');
        });

        it('dexScreenerToken() accepts custom chain', () => {
            const result = dexScreenerToken('0xABC', 'ethereum');
            expect(result).toContain('https://dexscreener.com/ethereum/0xABC');
        });
    });

    describe('formatters', () => {
        it('shortenAddress() truncates long addresses', () => {
            const addr = '7xKpR3nRm4qZ5bN2cW8dF1eG9hJk';
            expect(shortenAddress(addr)).toMatch(/^7xKp\.\.\.9hJk$/);
        });

        it('shortenAddress() returns short addresses unchanged', () => {
            expect(shortenAddress('abc')).toBe('abc');
        });

        it('shortenAddress() accepts custom char count', () => {
            const addr = '7xKpR3nRm4qZ5bN2cW8dF1eG9hJk';
            expect(shortenAddress(addr, 6)).toBe('7xKpR3...eG9hJk');
        });

        it('formatSol() converts lamports to SOL', () => {
            expect(formatSol(2_500_000_000)).toBe('2.50 SOL');
            expect(formatSol(1_000_000_000)).toBe('1.00 SOL');
        });

        it('formatSol() uses 4 decimals for small amounts', () => {
            expect(formatSol(500_000)).toBe('0.0005 SOL');
        });

        it('formatQuoteAmount() uses the quote mint decimals', () => {
            expect(formatQuoteAmount(2_500_000_000n)).toBe('2.50 SOL');
            expect(formatQuoteAmount(1_234_567n, USDC_MINT)).toBe('1.23 USDC');
        });

        it('formatQuoteAmount() shows raw base units for an unknown quote mint', () => {
            const mint = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
            expect(formatQuoteAmount(1_000_000n, mint)).toBe('1000000 base units of Es9v...wNYB');
        });

        it('formatNumber() adds commas', () => {
            expect(formatNumber(1234567)).toBe('1,234,567');
            expect(formatNumber(42)).toBe('42');
        });
    });
});
