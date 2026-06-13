// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

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
import { RpcClaimMonitor } from './rpc-monitor.js';
import { loadTracked } from './store.js';
import { log, setLogLevel } from './logger.js';

async function main(): Promise<void> {
    const config = loadConfig();
    setLogLevel(config.logLevel);

    // Two monitoring backends with an identical (config, onClaim) surface:
    //   • direct-RPC (RpcClaimMonitor): watches Solana directly — preferred, no
    //     external relay needed. Selected when SOLANA_RPC_URL is set.
    //   • relay (ClaimMonitor): consumes a pre-decoded feed from a WS relay.
    const useDirectRpc = Boolean(config.solanaRpcUrl);

    log.info('PumpFun Claim Bot starting...');
    log.info('  Mode: %s', useDirectRpc ? 'direct-RPC' : 'relay');
    if (useDirectRpc) {
        log.info('  RPC:  %s', config.solanaRpcUrl);
        log.info('  WS:   %s', config.solanaWsUrl || '(HTTP polling)');
    } else {
        log.info('  Relay: %s', config.relayWsUrl);
    }

    // Load persisted tracking data
    loadTracked();

    // Create bot
    const bot = createBot(config);

    // Wire claim handler
    const claimHandler = createClaimHandler(bot, config);

    // Create claim monitor (direct-RPC preferred, relay fallback)
    const monitor = useDirectRpc
        ? new RpcClaimMonitor(config, (event) => {
            claimHandler(event).catch((err) => log.error('Claim handler error: %s', err));
        })
        : new ClaimMonitor(config, (event) => {
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
