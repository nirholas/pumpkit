/**
 * @pumpkit/core — Link & Format Helpers
 *
 * Common link generators and text formatters for Telegram HTML messages.
 */

/** Telegram HTML anchor tag */
export function link(label: string, url: string): string {
    return `<a href="${url}">${label}</a>`;
}

/** Solscan transaction link */
export function solscanTx(signature: string): string {
    return link('View TX', `https://solscan.io/tx/${signature}`);
}

/** Solscan account link */
export function solscanAccount(address: string): string {
    return link(shortenAddress(address), `https://solscan.io/account/${address}`);
}

/** pump.fun token page link */
export function pumpFunToken(mint: string): string {
    return link('View on PumpFun', `https://pump.fun/coin/${mint}`);
}

/** DexScreener token page link */
export function dexScreenerToken(mint: string, chain = 'solana'): string {
    return link('DexScreener', `https://dexscreener.com/${chain}/${mint}`);
}

/** Telegram HTML bold tag */
export function bold(text: string): string {
    return `<b>${text}</b>`;
}

/** Telegram HTML code tag */
export function code(text: string): string {
    return `<code>${text}</code>`;
}

/** Telegram HTML italic tag */
export function italic(text: string): string {
    return `<i>${text}</i>`;
}

/** Shorten a Solana address: 7xKp...3nRm */
export function shortenAddress(address: string, chars = 4): string {
    if (address.length <= chars * 2 + 3) return address;
    return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/** Format lamports to SOL string: "2.50 SOL" */
export function formatSol(lamports: number | bigint): string {
    const sol = Number(lamports) / 1_000_000_000;
    return `${sol.toFixed(sol < 1 ? 4 : 2)} SOL`;
}

// Quote-mint awareness for the 2026-05-21 V2 rollout. Pump V2 events carry a
// trailing `quote_mint` pubkey; the `amount` they emit is in base units of
// that mint (lamports for SOL, micro-USDC for USDC, etc.). `WSOL_MINT` lives
// alongside the other program IDs in `solana/programs.ts` — we import it here
// so this module owns only the display-side concerns.
import { WSOL_MINT } from '../solana/programs.js';

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export const QUOTE_MINT_INFO: Record<string, { ticker: string; decimals: number; isStable: boolean }> = {
    [WSOL_MINT]: { ticker: 'SOL', decimals: 9, isStable: false },
    [USDC_MINT]: { ticker: 'USDC', decimals: 6, isStable: true },
};

/**
 * Quote-mint-aware amount formatter. Converts a `u64` base-units amount
 * (lamports / micro-USDC / etc.) into a display string with the right ticker.
 *
 * Defaults to SOL when `quoteMint` is omitted, preserving V1 behavior.
 */
export function formatQuoteAmount(baseUnits: number | bigint, quoteMint?: string): string {
    const info = QUOTE_MINT_INFO[quoteMint ?? WSOL_MINT] ?? QUOTE_MINT_INFO[WSOL_MINT]!;
    const amount = Number(baseUnits) / Math.pow(10, info.decimals);
    const precision = info.isStable ? 2 : (amount < 1 ? 4 : 2);
    return `${amount.toFixed(precision)} ${info.ticker}`;
}

/** Format number with commas: 1234567 → "1,234,567" */
export function formatNumber(n: number): string {
    return n.toLocaleString('en-US');
}
