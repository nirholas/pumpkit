// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
// Part of PumpKit — https://github.com/nirholas/pumpkit

/**
 * @pumpkit/core — Bot Scaffolding
 *
 * grammy bot factory with an error handler and command registration, and
 * a rate-limited broadcast helper. Use `onShutdown` from the shutdown module
 * to stop the bot on SIGINT/SIGTERM.
 */

import { Bot } from 'grammy';
import type { Context } from 'grammy';
import { log } from '../logger.js';

export type CommandHandler = (ctx: Context) => Promise<void> | void;

export interface BotOptions {
  /** Telegram Bot API token from @BotFather */
  token: string;
  /** Map of command name → handler */
  commands?: Record<string, CommandHandler>;
  /** Custom error handler */
  onError?: (err: unknown) => void;
}

/**
 * Create a configured Grammy bot instance with error handling
 * and registered commands.
 */
export function createBot(options: BotOptions): Bot {
  const bot = new Bot(options.token);

  // Error handling
  bot.catch((err) => {
    if (options.onError) {
      options.onError(err.error);
    } else {
      log.error('Bot error: %s', err.error);
    }
  });

  // Register commands
  if (options.commands) {
    for (const [name, handler] of Object.entries(options.commands)) {
      bot.command(name, handler);
    }
  }

  return bot;
}

/**
 * Broadcast a message to multiple chats with Telegram rate limiting.
 * Telegram allows max 30 messages/second. This spaces them ~35ms apart.
 */
export async function broadcast(
  bot: Bot,
  chatIds: number[],
  message: string,
  options?: { parseMode?: 'HTML' | 'MarkdownV2' },
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const parseMode = options?.parseMode ?? 'HTML';

  for (const chatId of chatIds) {
    try {
      await bot.api.sendMessage(chatId, message, { parse_mode: parseMode });
      sent++;
    } catch (err) {
      log.warn('Failed to broadcast to %d: %s', chatId, err);
      failed++;
    }
    // Rate-limit: ~28 msg/sec to stay under Telegram's 30/sec limit
    await new Promise((r) => setTimeout(r, 35));
  }

  return { sent, failed };
}
