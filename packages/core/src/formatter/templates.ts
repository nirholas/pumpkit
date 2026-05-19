/**
 * @pumpkit/core — Notification Templates
 *
 * Pre-built Telegram HTML notification messages for Pump protocol events.
 */

import type { PumpEvent } from '../types.js';
import { bold, code, formatQuoteAmount, formatSol, link, pumpFunToken, shortenAddress, solscanTx } from './links.js';

export interface ClaimEventData extends PumpEvent {
    type: 'claim';
    claimerWallet: string;
    tokenMint: string;
    tokenName?: string;
    tokenSymbol?: string;
    amountLamports: number;
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
    amountLamports: number;
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
    shareholders: Array<{ address: string; amountLamports: number }>;
    totalLamports: number;
    /** Optional quote mint (V2 events). Interprets shareholder/total amounts. */
    quoteMint?: string;
}

/** Format a fee claim notification */
export function formatClaim(event: ClaimEventData): string {
    const typeLabel =
        event.claimType === 'creator_fee' ? '🏷 Creator Fee' :
        event.claimType === 'cashback' ? '💸 Cashback' :
        '🤝 Social Fee';

    const lines = [
        bold(`💰 Fee Claimed — ${formatQuoteAmount(event.amountLamports, event.quoteMint)}`),
        '',
        `${typeLabel}`,
        `Token: ${event.tokenName ?? 'Unknown'} (${code(event.tokenSymbol ?? event.tokenMint)})`,
        `Claimer: ${code(shortenAddress(event.claimerWallet))}`,
        '',
        `${pumpFunToken(event.tokenMint)} · ${solscanTx(event.signature)}`,
    ];
    return lines.join('\n');
}

/** Format a new token launch notification */
export function formatLaunch(event: LaunchEventData): string {
    const lines = [
        bold(`🚀 New Token Launch`),
        '',
        `${bold(event.name)} (${code(`$${event.symbol}`)}`,
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
        ? link('View Pool', `https://pump.fun/coin/${event.tokenMint}`)
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
    const tokenLabel = event.tokenName
        ? `${event.tokenName} (${code(`$${event.tokenSymbol}`)})`
        : code(shortenAddress(event.tokenMint));

    const lines = [
        bold(`🐋 Whale ${action} — ${formatSol(event.amountLamports)}`),
        '',
        `${emoji} ${action} on ${tokenLabel}`,
        `Wallet: ${code(shortenAddress(event.wallet))}`,
        '',
        `${pumpFunToken(event.tokenMint)} · ${solscanTx(event.signature)}`,
    ];
    return lines.join('\n');
}

/** Format a creator transfer (CTO) notification */
export function formatCTO(event: CTOEventData): string {
    const tokenLabel = event.tokenName
        ? `${event.tokenName} (${code(`$${event.tokenSymbol}`)})`
        : code(shortenAddress(event.tokenMint));

    const lines = [
        bold(`👑 Creator Transfer`),
        '',
        `Token: ${tokenLabel}`,
        `From: ${code(shortenAddress(event.oldCreator))}`,
        `  To: ${code(shortenAddress(event.newCreator))}`,
        '',
        `${pumpFunToken(event.tokenMint)} · ${solscanTx(event.signature)}`,
    ];
    return lines.join('\n');
}

/** Format a fee distribution notification */
export function formatFeeDistribution(event: FeeDistEventData): string {
    const tokenLabel = event.tokenName
        ? `${event.tokenName} (${code(`$${event.tokenSymbol}`)})`
        : code(shortenAddress(event.tokenMint));

    const shareholderLines = event.shareholders.map(
        (s) => `  • ${code(shortenAddress(s.address))}: ${formatQuoteAmount(s.amountLamports, event.quoteMint)}`
    );

    const lines = [
        bold(`💎 Fee Distribution — ${formatQuoteAmount(event.totalLamports, event.quoteMint)}`),
        '',
        `Token: ${tokenLabel}`,
        '',
        bold('Shareholders:'),
        ...shareholderLines,
        '',
        `${pumpFunToken(event.tokenMint)} · ${solscanTx(event.signature)}`,
    ];
    return lines.join('\n');
}
