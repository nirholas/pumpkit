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

    const logLevel = (process.env.LOG_LEVEL || 'info') as BotConfig['logLevel'];

    const twitterBearerToken = process.env.TWITTER_BEARER_TOKEN;

    const twitterInfluencerIds = process.env.TWITTER_INFLUENCER_IDS
        ? process.env.TWITTER_INFLUENCER_IDS.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

    return {
        logLevel,
        relayWsUrl,
        telegramToken,
        twitterBearerToken,
        twitterInfluencerIds,
    };
}
