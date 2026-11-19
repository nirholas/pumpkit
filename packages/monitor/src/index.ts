// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

/**
 * PumpFun Telegram Bot + REST API — Entry Point
 *
 * Wires together config → monitor → bot → API and starts everything.
 *
 * Run:
 *   npm run dev                 (bot only, tsx watch)
 *   ENABLE_API=true npm run dev (bot + API)
 *   npm run api                 (API-only, no Telegram bot)
 *   npm run build && npm start  (production)
 */

import { loadConfig } from './config.js';
import { createBot, createClaimHandler, createCreatorChangeHandler } from './bot.js';
import {
    formatTokenLaunchNotification,
    formatGraduationNotificationWithToken,
    formatTradeAlertNotification,
    formatFeeDistributionNotification,
} from './formatters.js';
import type { TokenLaunchEvent, GraduationEvent, TradeAlertEvent, FeeDistributionEvent } from './types.js';
import { getActiveMonitors } from './launch-store.js';
import { log, setLogLevel } from '@pumpkit/core/logger';
import { PumpFunMonitor } from './monitor.js';
import { PumpEventMonitor } from './pump-event-monitor.js';
import { TokenLaunchMonitor } from './token-launch-monitor.js';
import { loadWatches } from './store.js';
import { loadApiConfig, PumpFunApi } from './api/index.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
    // ── Load config ──────────────────────────────────────────────────────
    const config = loadConfig();
    setLogLevel(config.logLevel);

    const enableApi = process.env.ENABLE_API === 'true' || process.env.API_ONLY === 'true';
    const apiOnly = process.env.API_ONLY === 'true';

    log.info('PumpFun %s starting...', apiOnly ? 'API' : enableApi ? 'Bot + API' : 'Bot');
    log.info('  RPC: %s', config.solanaRpcUrl);
    log.info('  WS:  %s', config.solanaWsUrl || '(derived from RPC)');
    if (!apiOnly) {
        log.info('  Allowed users: %s', config.allowedUserIds.length || 'all');
    }

    // ── Load persisted watches ───────────────────────────────────────────
    loadWatches();

    // ── Create Solana monitor (not started yet) ──────────────────────────
    // We pass placeholder callbacks; they get replaced after bot creation
    let claimHandler = (_event: import('./types.js').FeeClaimEvent) => { };
    let ctoHandler = (_event: import('./types.js').CreatorChangeEvent) => { };
    const monitor = new PumpFunMonitor(
        config,
        (event) => claimHandler(event),
        (event) => ctoHandler(event),
    );

    // ── Create API server (if enabled) ───────────────────────────────────
    let api: PumpFunApi | null = null;
    if (enableApi) {
        const apiConfig = loadApiConfig();
        api = new PumpFunApi(apiConfig, monitor);
        log.info('  API port: %d', apiConfig.port);
        log.info('  API keys: %s', apiConfig.apiKeys.length || 'none (open)');
    }

    // ── Create Telegram bot ──────────────────────────────────────────────
    const launchMonitor = new TokenLaunchMonitor(config, async (event: TokenLaunchEvent) => {
        if (!bot) return;
        const monitors = getActiveMonitors();
        for (const entry of monitors) {
            // Skip chats that disabled launch alerts
            if (!entry.alerts.launches) continue;
            // Apply github filter
            if (entry.githubOnly && !event.hasGithub) continue;

            try {
                const message = formatTokenLaunchNotification(event);
                await bot.api.sendMessage(entry.chatId, message, {
                    parse_mode: 'HTML',
                    link_preview_options: { is_disabled: true },
                });
            } catch (err) {
                log.error('Failed to send launch notification to chat %d:', entry.chatId, err);
            }
        }
    });

    // ── Create Pump Event Monitor (graduation, whale trades, fee distributions)
    let eventMonitor: PumpEventMonitor | undefined;
    const hasEventFeatures =
        config.enableGraduationAlerts ||
        config.enableTradeAlerts ||
        config.enableFeeDistributionAlerts;

    if (hasEventFeatures) {
        const broadcastToMonitors = async (
            alertKey: 'graduations' | 'whales' | 'feeDistributions',
            formatFn: (event: never) => string,
            event: GraduationEvent | TradeAlertEvent | FeeDistributionEvent,
        ) => {
            if (!bot) return;
            const monitors = getActiveMonitors();
            for (const entry of monitors) {
                // Respect per-chat alert preferences
                if (!entry.alerts[alertKey]) continue;
                try {
                    const message = formatFn(event as never);
                    await bot.api.sendMessage(entry.chatId, message, {
                        parse_mode: 'HTML',
                        link_preview_options: { is_disabled: true },
                    });
                } catch (err) {
                    log.error('Failed to send event notification to chat %d:', entry.chatId, err);
                }
            }
        };

        /** Broadcast graduation with enriched token data. */
        const broadcastGraduation = async (event: GraduationEvent) => {
            if (!bot) return;
            const monitors = getActiveMonitors();
            const message = await formatGraduationNotificationWithToken(event);
            for (const entry of monitors) {
                if (!entry.alerts.graduations) continue;
                try {
                    await bot.api.sendMessage(entry.chatId, message, {
                        parse_mode: 'HTML',
                        link_preview_options: { is_disabled: true },
                    });
                } catch (err) {
                    log.error('Failed to send graduation notification to chat %d:', entry.chatId, err);
                }
            }
        };

        eventMonitor = new PumpEventMonitor(
            config,
            (event: GraduationEvent) => broadcastGraduation(event),
            (event: TradeAlertEvent) => broadcastToMonitors('whales', formatTradeAlertNotification, event),
            (event: FeeDistributionEvent) => broadcastToMonitors('feeDistributions', formatFeeDistributionNotification, event),
        );
    }

    let bot: import('grammy').Bot | null = null;
    let botClaimHandler: ((event: import('./types.js').FeeClaimEvent) => Promise<void>) | null = null;

    if (!apiOnly) {
        bot = createBot(config, monitor, launchMonitor, eventMonitor);

        // Wire up the claim handler now that bot exists
        const handler = createClaimHandler(bot);
        botClaimHandler = handler;
    }

    // Wire up the unified claim handler (bot + API)
    claimHandler = (event) => {
        if (botClaimHandler) {
            botClaimHandler(event).catch((err) => log.error('Claim handler error:', err));
        }
        if (api) {
            api.handleClaim(event);
        }
    };

    // Wire up the CTO handler
    if (bot) {
        const ctoHandlerFn = createCreatorChangeHandler(bot);
        ctoHandler = (event) => {
            ctoHandlerFn(event).catch((err) => log.error('CTO handler error:', err));
        };
    }

    // ── Start API server FIRST (so health check responds) ──────────────
    if (api) {
        await api.start();
    }

    // ── Start monitor ────────────────────────────────────────────────────
    await monitor.start();

    // ── Start token launch monitor (if available and enabled) ────────────
    if (config.enableLaunchMonitor) {
        try {
            await launchMonitor.start();
            log.info('Token launch monitor started');
        } catch (err) {
            log.error('Failed to start token launch monitor:', err);
        }
    }

    // ── Start pump event monitor (if available and features enabled) ─────
    if (eventMonitor) {
        try {
            await eventMonitor.start();
            log.info('Pump event monitor started');
        } catch (err) {
            log.error('Failed to start pump event monitor:', err);
        }
    }

    // ── Start bot (polling mode for dev, webhook for prod) ───────────────
    if (!bot) {
        log.info('API-only mode — Telegram bot disabled');
    } else {
        log.info('Starting Telegram bot in polling mode...');

        await bot.api.setMyCommands([
            { command: 'start', description: 'Welcome & get started' },
            { command: 'help', description: 'Show all commands' },
            { command: 'watch', description: 'Watch a fee recipient wallet' },
            { command: 'unwatch', description: 'Stop watching a wallet' },
            { command: 'list', description: 'List active watches' },
            { command: 'status', description: 'Monitor status & stats' },
            { command: 'cto', description: 'Creator Takeover lookup & stats' },
            { command: 'alerts', description: 'Configure alert types per chat' },
            { command: 'monitor', description: 'Start real-time token launch feed' },
            { command: 'stopmonitor', description: 'Stop the token launch feed' },
            { command: 'price', description: 'Token price & bonding curve info' },
            { command: 'fees', description: 'Show fee tiers for a token' },
            { command: 'quote', description: 'Buy/sell quote estimate' },
        ]);

        bot.start({
            onStart: (info: { username: string }) => {
                log.info('Bot started: @%s', info.username);
                log.info('Send /start to the bot to begin!');
            },
        });
    }

    // ── Graceful shutdown ────────────────────────────────────────────────
    let shuttingDown = false;
    const shutdown = async (signal: string) => {
        if (shuttingDown) return;
        shuttingDown = true;
        log.info('Received %s, shutting down...', signal);
        // Exit even if a step hangs; the platform will SIGKILL us soon anyway.
        setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
        monitor.stop();
        api?.stop();
        launchMonitor.stop();
        eventMonitor?.stop();
        try {
            await bot?.stop();
        } catch (err) {
            log.warn('Bot stop failed: %s', err);
        }
        process.exit(0);
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
    log.error('Fatal error: %s', err instanceof Error ? (err.stack ?? err.message) : err);
    process.exit(1);
});

