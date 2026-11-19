// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

/**
 * @pumpkit/core — Notification Templates
 *
 * Pre-built Telegram HTML notification messages for Pump protocol events.
 */

import type { PumpEvent } from '../types.js';
import { bold, code, escapeHtml, formatQuoteAmount, formatSol, link, pumpFunToken, shortenAddress, solscanTx } from './links.js';

/** `Name ($SYMBOL)` with the name escaped, or the shortened mint when the name is unknown. */
function tokenLabel(mint: string, name?: string, symbol?: string): string {
    if (!name) return code(shortenAddress(mint));
    return `${escapeHtml(name)} (${code(`$${symbol ?? '???'}`)})`;
}

export interface ClaimEventData extends PumpEvent {
    type: 'claim';
    claimerWallet: string;
    /** Absent for creator-vault and cashback claims, which are per wallet rather than per coin. */
    tokenMint?: string;
    tokenName?: string;
    tokenSymbol?: string;
    amountLamports: number | bigint;
    claimType: 'creator_fee' | 'cashback' | 'social_fee';
    /** Optional quote mint (V2 events). When set, `amountLamports` is interpreted
     *  in base units of this mint — micro-USDC for USDC, lamports for SOL. */
    quoteMint?: string;
}

export interface LaunchEventData extends PumpEvent {
    type: 'launch';
    tokenMint: string;
    name: string;
    symbol: string;
    creator: string;
}

export interface GraduationEventData extends PumpEvent {
    type: 'graduation';
    tokenMint: string;
    tokenName: string;
    tokenSymbol: string;
    pool?: string;
}

export interface WhaleTradeEventData extends PumpEvent {
    type: 'whale';
    direction: 'buy' | 'sell';
    amountLamports: number | bigint;
    tokenMint: string;
    tokenName?: string;
    tokenSymbol?: string;
    wallet: string;
}

export interface CTOEventData extends PumpEvent {
    type: 'cto';
    tokenMint: string;
    tokenName?: string;
    tokenSymbol?: string;
    oldCreator: string;
    newCreator: string;
}

export interface FeeDistEventData extends PumpEvent {
    type: 'distribution';
    tokenMint: string;
    tokenName?: string;
    tokenSymbol?: string;
    shareholders: Array<{ address: string; amountLamports: number | bigint }>;
    totalLamports: number | bigint;
    /** Optional quote mint (V2 events). Interprets shareholder/total amounts. */
    quoteMint?: string;
}

/** Format a fee claim notification */
export function formatClaim(event: ClaimEventData): string {
    const typeLabel =
        event.claimType === 'creator_fee' ? '🏷 Creator Fee' :
        event.claimType === 'cashback' ? '💸 Cashback' :
        '🤝 Social Fee';

    const mint = event.tokenMint;
    const lines = [
        bold(`💰 Fee Claimed — ${formatQuoteAmount(event.amountLamports, event.quoteMint)}`),
        '',
        `${typeLabel}`,
        ...(mint ? [`Token: ${escapeHtml(event.tokenName ?? 'Unknown')} (${code(event.tokenSymbol ?? mint)})`] : []),
        `Claimer: ${code(shortenAddress(event.claimerWallet))}`,
        '',
        mint ? `${pumpFunToken(mint)} · ${solscanTx(event.signature)}` : solscanTx(event.signature),
    ];
    return lines.join('\n');
}

/** Format a new token launch notification */
export function formatLaunch(event: LaunchEventData): string {
    const lines = [
        bold(`🚀 New Token Launch`),
        '',
        `${bold(event.name)} (${code(`$${event.symbol}`)})`,
        `Creator: ${code(shortenAddress(event.creator))}`,
        `Mint: ${code(shortenAddress(event.tokenMint))}`,
        '',
        `${pumpFunToken(event.tokenMint)} · ${solscanTx(event.signature)}`,
    ];
    return lines.join('\n');
}

/** Format a graduation notification */
export function formatGraduation(event: GraduationEventData): string {
    const poolLink = event.pool
        ? link('View Pool', `https://solscan.io/account/${event.pool}`)
        : pumpFunToken(event.tokenMint);

    const lines = [
        bold(`🎓 Token Graduated!`),
        '',
        `${bold(event.tokenName)} (${code(`$${event.tokenSymbol}`)})`,
        `Migrated to PumpSwap AMM`,
        '',
        `${poolLink} · ${solscanTx(event.signature)}`,
    ];
    return lines.join('\n');
}

/** Format a whale trade notification */
export function formatWhaleTrade(event: WhaleTradeEventData): string {
    const emoji = event.direction === 'buy' ? '🟢' : '🔴';
    const action = event.direction === 'buy' ? 'Buy' : 'Sell';
    const token = tokenLabel(event.tokenMint, event.tokenName, event.tokenSymbol);

    const lines = [
        bold(`🐋 Whale ${action} — ${formatSol(event.amountLamports)}`),
        '',
        `${emoji} ${action} on ${token}`,
        `Wallet: ${code(shortenAddress(event.wallet))}`,
        '',
        `${pumpFunToken(event.tokenMint)} · ${solscanTx(event.signature)}`,
    ];
    return lines.join('\n');
}

/** Format a creator transfer (CTO) notification */
export function formatCTO(event: CTOEventData): string {
    const token = tokenLabel(event.tokenMint, event.tokenName, event.tokenSymbol);

    const lines = [
        bold(`👑 Creator Transfer`),
        '',
        `Token: ${token}`,
        `From: ${code(shortenAddress(event.oldCreator))}`,
        `  To: ${code(shortenAddress(event.newCreator))}`,
        '',
        `${pumpFunToken(event.tokenMint)} · ${solscanTx(event.signature)}`,
    ];
    return lines.join('\n');
}

/** Format a fee distribution notification */
export function formatFeeDistribution(event: FeeDistEventData): string {
    const token = tokenLabel(event.tokenMint, event.tokenName, event.tokenSymbol);

    const shareholderLines = event.shareholders.map(
        (s) => `  • ${code(shortenAddress(s.address))}: ${formatQuoteAmount(s.amountLamports, event.quoteMint)}`
    );

    const lines = [
        bold(`💎 Fee Distribution — ${formatQuoteAmount(event.totalLamports, event.quoteMint)}`),
        '',
        `Token: ${token}`,
        '',
        bold('Shareholders:'),
        ...shareholderLines,
        '',
        `${pumpFunToken(event.tokenMint)} · ${solscanTx(event.signature)}`,
    ];
    return lines.join('\n');
}
