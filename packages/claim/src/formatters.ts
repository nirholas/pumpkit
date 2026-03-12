/**
 * PumpFun Claim Bot — Message Formatters
 *
 * Rich HTML message formatting for Telegram.
 */

import type { FeeClaimEvent } from './types.js';
import type { TrackedItem } from './types.js';
import type { TokenInfo } from './pump-client.js';
import { formatFollowerCount } from './twitter-client.js';

// ============================================================================
// Helpers
// ============================================================================

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function shortAddr(addr: string): string {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatTime(unixSeconds: number): string {
    return new Date(unixSeconds * 1000).toUTCString().replace('GMT', 'UTC');
}

// ============================================================================
// Welcome / Help
// ============================================================================

export function formatWelcome(name: string): string {
    return (
        `🔔 <b>Welcome to PumpFun Fee Tracker, ${escapeHtml(name)}!</b>\n\n` +
        `I monitor PumpFun fee claims and notify you instantly when:\n` +
        `• Anyone claims fees for tokens you're tracking\n` +
        `• Tracked X accounts claim fees on any token\n\n` +
        `<b>Get started:</b>\n` +
        `/add &lt;token CA&gt; — Track a token\n` +
        `/add @handle — Track an X account\n` +
        `/list — See your tracked items\n` +
        `/help — Full command list\n\n` +
        `Stay ahead of the fee claims! 💰`
    );
}

export function formatHelp(): string {
    return (
        `🤖 <b>PumpFun Fee Claim Tracker</b>\n\n` +
        `<b>📌 Tracking:</b>\n` +
        `/add <code>&lt;token CA&gt;</code> — Track a token by contract address\n` +
        `/add <code>@handle</code> — Track an X (Twitter) account\n` +
        `/remove <code>&lt;token CA or @handle&gt;</code> — Stop tracking\n` +
        `/list — View all tracked items\n\n` +
        `<b>📊 Info:</b>\n` +
        `/status — Monitor status &amp; stats\n` +
        `/help — Show this message\n\n` +
        `<b>How it works:</b>\n` +
        `• <b>Token tracking:</b> I watch the Solana blockchain for fee claim ` +
        `transactions on the Pump & PumpSwap programs. When someone claims fees ` +
        `for a token you're tracking, you get notified instantly.\n` +
        `• <b>X handle tracking:</b> When a fee claim is detected, I check if ` +
        `the token's creator X account matches any handles you're tracking. ` +
        `If so, you get notified.\n\n` +
        `💡 <i>Tip: Use a paid RPC endpoint (Helius, QuickNode) for reliable ` +
        `real-time WebSocket monitoring.</i>`
    );
}

// ============================================================================
// Tracked Item List
// ============================================================================

export function formatTrackedList(items: TrackedItem[]): string {
    if (items.length === 0) {
        return (
            `📋 <b>No tracked items</b>\n\n` +
            `Add items with:\n` +
            `<code>/add &lt;token CA&gt;</code> — Track a token\n` +
            `<code>/add @handle</code> — Track an X account`
        );
    }

    const tokens = items.filter((i) => i.type === 'token');
    const handles = items.filter((i) => i.type === 'xhandle');

    let text = `📋 <b>Tracked Items (${items.length})</b>\n`;

    if (tokens.length > 0) {
        text += `\n🪙 <b>Tokens (${tokens.length}):</b>\n`;
        for (const t of tokens) {
            const label = t.label ? ` — ${escapeHtml(t.label)}` : '';
            text += `  • <code>${shortAddr(t.value)}</code>${label}\n`;
        }
    }

    if (handles.length > 0) {
        text += `\n🐦 <b>X Accounts (${handles.length}):</b>\n`;
        for (const h of handles) {
            const label = h.label ? ` — ${escapeHtml(h.label)}` : '';
            const handle = h.value.startsWith('@') ? h.value : `@${h.value}`;
            text += `  • ${escapeHtml(handle)}${label}\n`;
        }
    }

    text += `\nRemove with: <code>/remove &lt;token CA or @handle&gt;</code>`;
    return text;
}

// ============================================================================
// Claim Notification
// ============================================================================

export function formatClaimNotification(
    event: FeeClaimEvent,
    item: TrackedItem,
    token: TokenInfo | null,
): string {
    const emoji = event.isCashback ? '💸' : '🏦';
    const typeLabel = event.claimLabel || (event.isCashback ? 'Cashback Claim' : 'Creator Fee Claim');

    const shortWallet = shortAddr(event.claimerWallet);
    const solAmount = event.amountSol.toFixed(4);

    // Token info line
    let tokenLine: string;
    if (token) {
        tokenLine = `<b>Token:</b> ${escapeHtml(token.symbol)} (${escapeHtml(token.name)})`;
        if (token.usdMarketCap > 0) {
            tokenLine += ` · $${formatNumber(token.usdMarketCap)} mcap`;
        }
    } else if (event.tokenSymbol) {
        tokenLine = `<b>Token:</b> ${escapeHtml(event.tokenSymbol)}`;
    } else {
        tokenLine = `<b>Token:</b> <code>${shortAddr(event.tokenMint)}</code>`;
    }

        // Twitter info line (if available)
        let twitterLine = '';
        if (token?.twitterUserInfo) {
            const { username, followersCount, followedByInfluencers } = token.twitterUserInfo;
            const formattedFollowers = formatFollowerCount(followersCount);
            twitterLine = `🐦 <b>X Account:</b> @${escapeHtml(username)} · ${formattedFollowers} followers`;
        
            if (followedByInfluencers.length > 0) {
                twitterLine += ` · ⭐ Followed by ${followedByInfluencers.length} tracked influencer(s)`;
            }
            twitterLine += '\n';
        }

    // What triggered this notification
    let matchLine: string;
    if (item.type === 'token') {
        matchLine = `📌 <b>Matched:</b> Tracked token <code>${shortAddr(item.value)}</code>`;
    } else {
        const handle = item.value.startsWith('@') ? item.value : `@${item.value}`;
        matchLine = `📌 <b>Matched:</b> Tracked X account ${escapeHtml(handle)}`;
    }
    if (item.label) {
        matchLine += ` (${escapeHtml(item.label)})`;
    }

    const programLabel = event.programId.includes('pAMM') ? 'PumpSwap AMM' : 'Pump';

    // CA line
    const mint = event.tokenMint?.trim() || '';
    let caLine = '';
    if (mint) {
        caLine = `🧬 <b>CA:</b> <code>${mint}</code>\n`;
    } else if (event.claimType === 'claim_social_fee_pda' || event.claimType === 'claim_cashback' || event.claimType === 'collect_creator_fee') {
        caLine = `🧬 <b>CA:</b> <i>N/A (wallet-level claim)</i>\n`;
    }
    if (event.socialFeePda) {
        caLine += `🧾 <b>Social PDA:</b> <code>${shortAddr(event.socialFeePda)}</code>\n`;
    }

    const solscanTx = `https://solscan.io/tx/${encodeURIComponent(event.txSignature)}`;
    const solscanWallet = `https://solscan.io/account/${encodeURIComponent(event.claimerWallet)}`;
    const pumpfunToken = mint ? `https://pump.fun/coin/${encodeURIComponent(mint)}` : null;

    const links = pumpfunToken
        ? `🔗 <a href="${solscanTx}">TX</a> · <a href="${solscanWallet}">Wallet</a> · <a href="${pumpfunToken}">pump.fun</a>`
        : `🔗 <a href="${solscanTx}">TX</a> · <a href="${solscanWallet}">Wallet</a>`;

    return (
        `${emoji} <b>${typeLabel} Detected!</b>\n\n` +
        `👤 <b>Claimer:</b> <code>${shortWallet}</code>\n` +
        `💰 <b>Amount:</b> ${solAmount} SOL\n` +
        `${tokenLine}\n` +
            `${twitterLine}` +
        `${caLine}` +
        `⚙️ <b>Program:</b> ${programLabel}\n` +
        `🕐 <b>Time:</b> ${formatTime(event.timestamp)}\n` +
        `${matchLine}\n\n` +
        `${links}`
    );
}

// ============================================================================
// Status
// ============================================================================

export interface MonitorStatus {
    isRunning: boolean;
    mode: string;
    claimsDetected: number;
    uptimeMs: number;
    trackedTokens: number;
    trackedXHandles: number;
}

export function formatStatus(status: MonitorStatus): string {
    const uptime = formatDuration(status.uptimeMs);

    return (
        `📊 <b>PumpFun Fee Claim Tracker Status</b>\n\n` +
        `⚡ <b>Running:</b> ${status.isRunning ? '✅ Yes' : '❌ No'}\n` +
        `🔌 <b>Mode:</b> ${status.mode}\n` +
        `🪙 <b>Tracked Tokens:</b> ${status.trackedTokens}\n` +
        `🐦 <b>Tracked X Accounts:</b> ${status.trackedXHandles}\n` +
        `🔔 <b>Claims Detected:</b> ${status.claimsDetected}\n` +
        `⏱️ <b>Uptime:</b> ${uptime}`
    );
}

// ============================================================================
// Utilities
// ============================================================================

function formatDuration(ms: number): string {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
}

function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toFixed(0);
}
