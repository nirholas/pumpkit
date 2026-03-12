/**
 * PumpFun Claim Bot — Telegram Bot & Command Handlers
 *
 * Interactive bot with /add, /remove, /list, /status, /help commands.
 * Users track tokens (by CA) or X accounts (by handle) and get
 * notified when fee claims are detected.
 */

import { Bot } from 'grammy';
import type { Context } from 'grammy';

import type { BotConfig, FeeClaimEvent } from './types.js';
import {
    escapeHtml,
    formatClaimNotification,
    formatHelp,
    formatStatus,
    formatTrackedList,
    formatWelcome,
    type MonitorStatus,
} from './formatters.js';
import { fetchTokenInfo, getXHandleFromToken } from './pump-client.js';
import { fetchTwitterUserInfo } from './twitter-client.js';
import {
    addTrackedItem,
    findMatchingTokenTracks,
    findMatchingXHandleTracks,
    getAllTrackedTokenMints,
    getAllTrackedXHandles,
    getTrackedForChat,
    getTrackedTokensForChat,
    getTrackedXHandlesForChat,
    isAlreadyTracked,
    removeTrackedByValue,
} from './store.js';
import { log } from './logger.js';
import type { ClaimMonitor } from './monitor.js';

// ============================================================================
// Bot Factory
// ============================================================================

export function createBot(config: BotConfig): Bot {
    const bot = new Bot(config.telegramToken);

    bot.catch((err) => {
        log.error('Bot error:', err.error);
    });

    // ── Commands ──────────────────────────────────────────────────────
    bot.command('start', handleStart);
    bot.command('help', handleHelp);
    bot.command('add', handleAdd);
    bot.command('remove', handleRemove);
    bot.command('list', handleList);
    // /status is wired in index.ts after monitor is created

    // ── Fallback ─────────────────────────────────────────────────────
    bot.on('message:text', async (ctx) => {
        if (ctx.chat.type === 'private') {
            await ctx.reply(
                '💡 Use /help to see available commands.',
                { parse_mode: 'HTML' },
            );
        }
    });

    return bot;
}

// ============================================================================
// /start
// ============================================================================

async function handleStart(ctx: Context): Promise<void> {
    const name = ctx.from?.first_name || ctx.from?.username || 'there';
    await ctx.reply(formatWelcome(name), {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
    });
}

// ============================================================================
// /help
// ============================================================================

async function handleHelp(ctx: Context): Promise<void> {
    await ctx.reply(formatHelp(), {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
    });
}

// ============================================================================
// /add <token CA> or /add @handle
// ============================================================================

async function handleAdd(ctx: Context): Promise<void> {
    const text = ctx.message?.text || '';
    const parts = text.split(/\s+/).slice(1);

    if (parts.length === 0) {
        await ctx.reply(
            '📌 <b>Track a Token or X Account</b>\n\n' +
            'Usage:\n' +
            '<code>/add &lt;token CA&gt;</code> — Track a token\n' +
            '<code>/add @handle</code> — Track an X account\n\n' +
            'Examples:\n' +
            '<code>/add HN7c...4xYz</code>\n' +
            '<code>/add @elonmusk</code>',
            { parse_mode: 'HTML' },
        );
        return;
    }

    const value = parts[0]!;
    const label = parts.slice(1).join(' ') || undefined;

    // Determine type: X handle starts with @, otherwise it's a token CA
    if (value.startsWith('@')) {
        // X handle
        const handle = value.slice(1).trim();
        if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
            await ctx.reply(
                '❌ Invalid X handle. Must be 1-15 characters (letters, numbers, underscores).',
            );
            return;
        }

        if (isAlreadyTracked(handle, ctx.chat!.id)) {
            await ctx.reply(`⚠️ <b>@${escapeHtml(handle)}</b> is already being tracked.`, {
                parse_mode: 'HTML',
            });
            return;
        }

        const item = addTrackedItem(ctx.chat!.id, ctx.from!.id, 'xhandle', handle, label);
        await ctx.reply(
            `✅ <b>Now tracking X account</b>\n\n` +
            `🐦 <b>Handle:</b> @${escapeHtml(handle)}\n` +
            `🔔 You'll be notified when this account claims fees on any PumpFun token.\n\n` +
            `ID: <code>${item.id}</code>`,
            { parse_mode: 'HTML' },
        );
    } else {
        // Token CA — validate as Solana address
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) {
            await ctx.reply(
                '❌ Invalid Solana address. Must be a base58-encoded public key (32-44 characters).\n\n' +
                '💡 To track an X account, prefix with @: <code>/add @handle</code>',
                { parse_mode: 'HTML' },
            );
            return;
        }

        if (isAlreadyTracked(value, ctx.chat!.id)) {
            await ctx.reply(`⚠️ This token is already being tracked.`);
            return;
        }

        // Try to fetch token info for a nicer confirmation
        const tokenInfo = await fetchTokenInfo(value);
        const item = addTrackedItem(ctx.chat!.id, ctx.from!.id, 'token', value, label);

        const shortAddr = `${value.slice(0, 6)}…${value.slice(-4)}`;
        let tokenDesc = `🪙 <b>Token:</b> <code>${shortAddr}</code>`;
        if (tokenInfo) {
            tokenDesc = `🪙 <b>Token:</b> ${escapeHtml(tokenInfo.symbol)} (${escapeHtml(tokenInfo.name)})`;
        }

        await ctx.reply(
            `✅ <b>Now tracking token</b>\n\n` +
            `${tokenDesc}\n` +
            `🔔 You'll be notified when anyone claims fees for this token.\n\n` +
            `ID: <code>${item.id}</code>`,
            { parse_mode: 'HTML' },
        );
    }
}

// ============================================================================
// /remove <token CA or @handle>
// ============================================================================

async function handleRemove(ctx: Context): Promise<void> {
    const text = ctx.message?.text || '';
    const parts = text.split(/\s+/).slice(1);

    if (parts.length === 0) {
        await ctx.reply(
            '🗑️ <b>Stop Tracking</b>\n\n' +
            'Usage: <code>/remove &lt;token CA or @handle&gt;</code>\n\n' +
            'Examples:\n' +
            '<code>/remove HN7c...4xYz</code>\n' +
            '<code>/remove @elonmusk</code>',
            { parse_mode: 'HTML' },
        );
        return;
    }

    const value = parts[0]!;
    const removed = removeTrackedByValue(value, ctx.chat!.id);

    if (removed) {
        await ctx.reply(`✅ Stopped tracking <code>${escapeHtml(value)}</code>`, {
            parse_mode: 'HTML',
        });
    } else {
        await ctx.reply(
            `❌ <code>${escapeHtml(value)}</code> is not being tracked.\n\n` +
            `Use /list to see your tracked items.`,
            { parse_mode: 'HTML' },
        );
    }
}

// ============================================================================
// /list
// ============================================================================

async function handleList(ctx: Context): Promise<void> {
    const items = getTrackedForChat(ctx.chat!.id);
    await ctx.reply(formatTrackedList(items), {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
    });
}

// ============================================================================
// Status handler factory (needs monitor reference)
// ============================================================================

export function registerStatusCommand(bot: Bot, monitor: ClaimMonitor): void {
    bot.command('status', async (ctx) => {
        const tokens = getTrackedTokensForChat(ctx.chat!.id);
        const handles = getTrackedXHandlesForChat(ctx.chat!.id);

        const status: MonitorStatus = {
            isRunning: true,
            mode: monitor.getMode(),
            claimsDetected: monitor.claimsDetected,
            uptimeMs: monitor.getUptimeMs(),
            trackedTokens: tokens.length,
            trackedXHandles: handles.length,
        };

        await ctx.reply(formatStatus(status), {
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
        });
    });
}

// ============================================================================
// Claim handler factory — notifies relevant chats
// ============================================================================

export function createClaimHandler(bot: Bot, config: BotConfig): (event: FeeClaimEvent) => Promise<void> {
    return async (event: FeeClaimEvent) => {
        try {
            // 1. Check if any chat is tracking this token mint
            const tokenTracks = findMatchingTokenTracks(event.tokenMint);

            // 2. Check if any chat is tracking an X handle that matches the token creator
            let xHandleTracks: ReturnType<typeof findMatchingXHandleTracks> = [];
            const allXHandles = getAllTrackedXHandles();

            if (allXHandles.size > 0) {
                // Fetch token info to get the creator's X handle
                const tokenInfo = await fetchTokenInfo(event.tokenMint);
                if (tokenInfo) {
                    const creatorHandle = getXHandleFromToken(tokenInfo);
                    if (creatorHandle && allXHandles.has(creatorHandle)) {
                        xHandleTracks = findMatchingXHandleTracks(creatorHandle);
                    }

                    // Enrich event with token info
                    event.tokenName = tokenInfo.name;
                    event.tokenSymbol = tokenInfo.symbol;
                }
            }

            // No matches — skip
            if (tokenTracks.length === 0 && xHandleTracks.length === 0) return;

            // 3. Notify all matching chats
            const tokenInfo = await fetchTokenInfo(event.tokenMint);

            // Fetch Twitter follower info if available
            if (tokenInfo && config.twitterBearerToken) {
                const creatorHandle = getXHandleFromToken(tokenInfo);
                if (creatorHandle) {
                    const twitterInfo = await fetchTwitterUserInfo(
                        creatorHandle,
                        config.twitterBearerToken,
                        config.twitterInfluencerIds,
                    );
                    if (twitterInfo) {
                        tokenInfo.twitterUserInfo = twitterInfo;
                    }
                }
            }

            // Deduplicate by chatId to avoid double-notifying
            const notified = new Set<number>();

            for (const item of [...tokenTracks, ...xHandleTracks]) {
                if (notified.has(item.chatId)) continue;
                notified.add(item.chatId);

                try {
                    const message = formatClaimNotification(event, item, tokenInfo);
                    await bot.api.sendMessage(item.chatId, message, {
                        parse_mode: 'HTML',
                        link_preview_options: { is_disabled: true },
                    });
                } catch (err) {
                    log.error('Failed to notify chat %d: %s', item.chatId, err);
                }
            }

            log.info('Notified %d chat(s) for claim on %s', notified.size, event.tokenMint.slice(0, 8));
        } catch (err) {
            log.error('Claim handler error: %s', err);
        }
    };
}
