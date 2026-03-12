/**
 * PumpFun Claim Bot — Entry Point
 *
 * Interactive Telegram bot that lets users track PumpFun tokens (by CA)
 * and X accounts (by handle). Monitors the Solana blockchain for fee claim
 * transactions and notifies users when their tracked items are involved.
 *
 * Inspired by Bags.fm Fee Tracker Bot.
 *
 * Run:
 *   npm run dev          (hot reload)
 *   npm run build && npm start  (production)
 */

import { loadConfig } from './config.js';
import { createBot, createClaimHandler, registerStatusCommand } from './bot.js';
import { ClaimMonitor } from './monitor.js';
import { loadTracked } from './store.js';
import { log, setLogLevel } from './logger.js';

async function main(): Promise<void> {
    const config = loadConfig();
    setLogLevel(config.logLevel);

    log.info('PumpFun Claim Bot starting...');
    log.info('  Relay: %s', config.relayWsUrl);

    // Load persisted tracking data
    loadTracked();

    // Create bot
    const bot = createBot(config);

    // Wire claim handler
    const claimHandler = createClaimHandler(bot, config);

    // Create claim monitor
    const monitor = new ClaimMonitor(config, (event) => {
        claimHandler(event).catch((err) => log.error('Claim handler error: %s', err));
    });

    // Wire status command (needs monitor reference)
    registerStatusCommand(bot, monitor);

    // Start monitor
    await monitor.start();

    // Start bot (long polling)
    log.info('Starting Telegram bot (long polling)...');
    bot.start({
        onStart: () => {
            log.info('✅ PumpFun Claim Bot is running!');
        },
    });

    // Graceful shutdown
    const shutdown = async () => {
        log.info('Shutting down...');
        monitor.stop();
        await bot.stop();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
