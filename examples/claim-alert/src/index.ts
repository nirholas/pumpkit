/**
 * examples/claim-alert — Minimal Fee Claim Alert Bot
 *
 * A ~100-line reference implementation showing how to wire @pumpkit/core's
 * primitives into a working Telegram bot:
 *
 *   - createBot           — grammy scaffold with /start, /help, /watch, /list
 *   - ClaimMonitor        — subscribes to PumpFun fee claim events
 *   - FileStore           — JSON-backed persistence for watched tokens
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

interface WatchedTokens {
  mints: string[];
}

const store = new FileStore<WatchedTokens>({
  path: STORE_PATH,
  defaultValue: { mints: [] },
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
        'PumpKit Claim Alert bot online. Use /watch <mint> to track a token, /list to see what I am watching.',
      );
    },
    help: async (ctx: Context) => {
      await ctx.reply(
        [
          'Commands:',
          '/watch <mint>   — start receiving alerts for a token',
          '/unwatch <mint> — stop receiving alerts',
          '/list           — show watched mints',
        ].join('\n'),
      );
    },
  },
});

bot.command('watch', async (ctx: Context) => {
  const mint = typeof ctx.match === 'string' ? ctx.match.trim() : '';
  if (!mint) return ctx.reply('Usage: /watch <mint-address>');
  const state = store.read();
  if (state.mints.includes(mint)) return ctx.reply(`Already watching ${mint}`);
  store.write({ mints: [...state.mints, mint] });
  return ctx.reply(`Watching ${mint}`);
});

bot.command('unwatch', async (ctx: Context) => {
  const mint = typeof ctx.match === 'string' ? ctx.match.trim() : '';
  if (!mint) return ctx.reply('Usage: /unwatch <mint-address>');
  const state = store.read();
  const next = state.mints.filter((m: string) => m !== mint);
  if (next.length === state.mints.length) return ctx.reply(`Not watching ${mint}`);
  store.write({ mints: next });
  return ctx.reply(`Stopped watching ${mint}`);
});

bot.command('list', async (ctx: Context) => {
  const { mints } = store.read();
  if (mints.length === 0) return ctx.reply('Not watching any tokens yet. Use /watch <mint>.');
  return ctx.reply(`Watching ${mints.length} token(s):\n${mints.map((m: string) => `• ${m}`).join('\n')}`);
});

function toClaimEventData(e: ClaimEvent): ClaimEventData {
  return {
    type: 'claim',
    signature: e.signature,
    slot: 0,
    blockTime: e.timestamp || null,
    claimerWallet: e.wallet,
    tokenMint: e.mint,
    tokenName: e.tokenName,
    tokenSymbol: e.tokenSymbol,
    amountLamports: e.amount,
    claimType: 'creator_fee',
  };
}

const monitor = new ClaimMonitor({
  connection: rpc.getConnection(),
  onClaim: async (event: ClaimEvent) => {
    const { mints } = store.read();
    const isWatched = mints.length === 0 || mints.includes(event.mint);
    if (!isWatched) {
      log.debug('Ignoring claim for unwatched mint %s', event.mint);
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
              body: JSON.stringify({ type: 'claim', event }),
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
log.info('Claim alert bot online — watching %d token(s)', store.read().mints.length);
