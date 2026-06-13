// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

/**
 * PumpFun Claim Bot — Configuration
 *
 * Loads and validates environment variables.
 */

import 'dotenv/config';

import type { BotConfig } from './types.js';

export function loadConfig(): BotConfig {
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!telegramToken) {
        throw new Error(
            'TELEGRAM_BOT_TOKEN is required. Create a bot via @BotFather and set the env var.',
        );
    }

    const relayWsUrl = process.env.RELAY_WS_URL || 'ws://localhost:3099/ws';

    // Direct-RPC mode (preferred): when SOLANA_RPC_URL is set, the bot monitors
    // Solana directly via RpcClaimMonitor and needs no external relay server.
    const solanaRpcUrl = process.env.SOLANA_RPC_URL || undefined;
    const solanaRpcUrls = process.env.SOLANA_RPC_URLS
        ? process.env.SOLANA_RPC_URLS.split(',').map((s) => s.trim()).filter(Boolean)
        : solanaRpcUrl
            ? [solanaRpcUrl]
            : [];

    // Use explicit WS endpoint when provided; otherwise derive wss:// from the
    // HTTP RPC URL so providers like Helius/Triton/QuickNode get a real socket.
    let solanaWsUrl = process.env.SOLANA_WS_URL || undefined;
    if (!solanaWsUrl && solanaRpcUrl?.startsWith('https://')) {
        solanaWsUrl = solanaRpcUrl.replace(/^https:\/\//, 'wss://');
    }

    const pollIntervalSeconds = Number.parseInt(process.env.POLL_INTERVAL_SECONDS || '15', 10);

    const logLevel = (process.env.LOG_LEVEL || 'info') as BotConfig['logLevel'];

    const twitterBearerToken = process.env.TWITTER_BEARER_TOKEN;

    const twitterInfluencerIds = process.env.TWITTER_INFLUENCER_IDS
        ? process.env.TWITTER_INFLUENCER_IDS.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

    return {
        logLevel,
        relayWsUrl,
        solanaRpcUrl,
        solanaRpcUrls,
        solanaWsUrl,
        pollIntervalSeconds,
        telegramToken,
        twitterBearerToken,
        twitterInfluencerIds,
    };
}
