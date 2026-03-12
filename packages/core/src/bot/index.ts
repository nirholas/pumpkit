/**
 * @pumpkit/core — Bot Scaffolding
 *
 * Grammy-based Telegram bot factory with shared patterns
 * extracted from all PumpKit bot implementations.
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
  /** Default parse mode for messages (default: 'HTML') */
  parseMode?: 'HTML' | 'MarkdownV2';
  /** Admin chat IDs to notify on critical events */
  adminChatIds?: number[];
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

/**
 * Setup graceful shutdown for a Grammy bot with optional cleanup functions.
 */
export function setupShutdown(bot: Bot, ...cleanups: Array<() => Promise<void> | void>): void {
  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('Received %s — shutting down bot…', signal);

    try {
      bot.stop();
    } catch {
      // bot may not be running
    }

    for (const cleanup of cleanups) {
      try {
        await cleanup();
      } catch (err) {
        log.error('Shutdown cleanup error: %s', err);
      }
    }

    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
