// ── Outsiders Bot — Config ─────────────────────────────────────────

import 'dotenv/config';
import type { BotConfig } from './types.js';

export function loadConfig(): BotConfig {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is required');
  }

  return {
    telegramBotToken: token,
    callChannelId: process.env.CALL_CHANNEL_ID
      ? Number(process.env.CALL_CHANNEL_ID)
      : null,
    dexscreenerApi:
      process.env.DEXSCREENER_API ?? 'https://api.dexscreener.com',
    athPollInterval: Number(process.env.ATH_POLL_INTERVAL ?? '60'),
    logLevel: (process.env.LOG_LEVEL as BotConfig['logLevel']) ?? 'info',
    dbPath: process.env.DB_PATH ?? './outsiders.db',
  };
}
