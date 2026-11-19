// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

/**
 * examples/claim-alert — Minimal Fee Claim Alert Bot
 *
 * A ~100-line reference implementation showing how to wire @pumpkit/core's
 * primitives into a working Telegram bot:
 *
 *   - createBot           — grammy scaffold with /start, /help, /watch, /list
 *   - ClaimMonitor        — decodes Pump, PumpSwap and PumpFees fee claim events
 *   - FileStore           — JSON-backed persistence for watched wallets
 *   - createRpcConnection — RPC client with automatic failover
 *   - retry               — wraps webhook delivery with exponential backoff
 *   - formatClaim         — HTML message builder for Telegram
 *   - installShutdownHandlers — clean SIGINT/SIGTERM teardown
 *
 * Required env:
 *   BOT_TOKEN       — grammy/Telegram bot token
 *   SOLANA_RPC_URL  — primary RPC endpoint
 *   CHAT_ID         — Telegram chat to broadcast to
 *
 * Optional env:
 *   FALLBACK_RPC_URL    — comma-separated fallback RPC URLs
 *   WEBHOOK_URL         — POST every claim event here (with retry/backoff)
 *   STORE_PATH          — FileStore path (default: ./data/watched.json)
 *   LOG_LEVEL           — debug | info | warn | error (default: info)
 */

import 'dotenv/config';
import type { Context } from 'grammy';
import {
  log,
  setLogLevel,
  type LogLevel,
  requireEnv,
  optionalEnv,
  parseListEnv,
  createBot,
  createRpcConnection,
  ClaimMonitor,
  FileStore,
  formatClaim,
  onShutdown,
  installShutdownHandlers,
  retry,
  type ClaimEvent,
  type ClaimEventData,
} from '@pumpkit/core';

setLogLevel(optionalEnv('LOG_LEVEL', 'info') as LogLevel);

const BOT_TOKEN = requireEnv('BOT_TOKEN');
const RPC_URL = requireEnv('SOLANA_RPC_URL');
const CHAT_ID = requireEnv('CHAT_ID');

const FALLBACK_RPC_URLS = parseListEnv('FALLBACK_RPC_URL');
const WEBHOOK_URL = optionalEnv('WEBHOOK_URL', '');
const STORE_PATH = optionalEnv('STORE_PATH', './data/watched.json');

interface WatchedWallets {
  wallets: string[];
}

const store = new FileStore<WatchedWallets>({
  path: STORE_PATH,
  defaultValue: { wallets: [] },
});

const rpc = createRpcConnection({
  url: RPC_URL,
  fallbackUrls: FALLBACK_RPC_URLS,
  commitment: 'confirmed',
});

const bot = createBot({
  token: BOT_TOKEN,
  commands: {
    start: async (ctx: Context) => {
      await ctx.reply(
        'PumpKit Claim Alert bot online. Use /watch <wallet> to track a claimer, /list to see what I am watching.',
      );
    },
    help: async (ctx: Context) => {
      await ctx.reply(
        [
          'Commands:',
          '/watch <wallet>   — alert when this wallet claims fees',
          '/unwatch <wallet> — stop alerting for it',
          '/list             — show watched wallets',
        ].join('\n'),
      );
    },
  },
});

bot.command('watch', async (ctx: Context) => {
  const wallet = typeof ctx.match === 'string' ? ctx.match.trim() : '';
  if (!wallet) return ctx.reply('Usage: /watch <wallet-address>');
  const state = store.read();
  if (state.wallets.includes(wallet)) return ctx.reply(`Already watching ${wallet}`);
  store.write({ wallets: [...state.wallets, wallet] });
  return ctx.reply(`Watching ${wallet}`);
});

bot.command('unwatch', async (ctx: Context) => {
  const wallet = typeof ctx.match === 'string' ? ctx.match.trim() : '';
  if (!wallet) return ctx.reply('Usage: /unwatch <wallet-address>');
  const state = store.read();
  const next = state.wallets.filter((w: string) => w !== wallet);
  if (next.length === state.wallets.length) return ctx.reply(`Not watching ${wallet}`);
  store.write({ wallets: next });
  return ctx.reply(`Stopped watching ${wallet}`);
});

bot.command('list', async (ctx: Context) => {
  const { wallets } = store.read();
  if (wallets.length === 0) return ctx.reply('Not watching any wallets yet. Use /watch <wallet>.');
  return ctx.reply(`Watching ${wallets.length} wallet(s):\n${wallets.map((w: string) => `• ${w}`).join('\n')}`);
});

function toClaimEventData(e: ClaimEvent): ClaimEventData {
  return {
    type: 'claim',
    signature: e.signature,
    slot: e.slot,
    blockTime: Math.floor(e.timestamp / 1000),
    claimerWallet: e.wallet,
    amountLamports: e.amount,
    claimType: e.kind === 'amm_creator_fee' ? 'creator_fee' : e.kind,
    ...(e.quoteMint ? { quoteMint: e.quoteMint } : {}),
  };
}

/** JSON body for the webhook. Amounts are bigints, which JSON.stringify cannot encode. */
function webhookBody(event: ClaimEvent): string {
  return JSON.stringify({ type: 'claim', event: { ...event, amount: event.amount.toString() } });
}

const monitor = new ClaimMonitor({
  connection: rpc.getConnection(),
  onClaim: async (event: ClaimEvent) => {
    const { wallets } = store.read();
    if (wallets.length > 0 && !wallets.includes(event.wallet)) {
      log.debug('Ignoring claim by unwatched wallet %s', event.wallet);
      return;
    }

    const html = formatClaim(toClaimEventData(event));
    try {
      await bot.api.sendMessage(CHAT_ID, html, { parse_mode: 'HTML' });
    } catch (err) {
      log.error('Telegram send failed: %s', err instanceof Error ? err.message : err);
    }

    if (WEBHOOK_URL) {
      // Webhook delivery with exponential backoff — retries on transient
      // failures (429, 5xx, network errors), gives up on 4xx auth errors.
      try {
        await retry(
          async () => {
            const res = await fetch(WEBHOOK_URL, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: webhookBody(event),
              signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          },
          { label: 'webhook', maxAttempts: 4, initialDelayMs: 500 },
        );
      } catch (err) {
        log.error('Webhook delivery exhausted: %s', err instanceof Error ? err.message : err);
      }
    }
  },
});

onShutdown(async () => {
  log.info('Stopping monitor and bot…');
  monitor.stop();
  await bot.stop();
});
installShutdownHandlers();

monitor.start();
await bot.start();
log.info('Claim alert bot online — watching %d wallet(s)', store.read().wallets.length);
