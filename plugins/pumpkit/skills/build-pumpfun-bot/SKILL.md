---
name: build-pumpfun-bot
description: Build a PumpFun Telegram bot on Solana with the PumpKit framework (@pumpkit/core): on-chain event monitors, RPC fallback, message formatters and graceful shutdown. Use when a user wants a claim, launch, graduation or whale alert bot.
---

# Build a PumpFun Telegram bot with PumpKit

PumpKit is a TypeScript monorepo (Node 20 or newer). `@pumpkit/core` is NOT on the npm registry (`npm install @pumpkit/core` returns 404), so build the repo and install the workspace package by path:

```
git clone https://github.com/nirholas/pumpkit.git
(cd pumpkit && npm install && npm run build)
cd my-bot
npm install ../pumpkit/packages/core grammy @solana/web3.js
```

The repo also holds ready-made bots under `packages/`: `monitor`, `tracker`, `claim` and `channel`, each with its own README and Dockerfile. Read the matching `packages/<name>/README.md` before running one.

## What `@pumpkit/core` exports

- Bot: `createBot({ token, commands?: Record<string, handler>, onError?, parseMode?, adminChatIds? })` returns a grammy `Bot`; `broadcast(bot, chatIds: number[], html)` returns `{ sent, failed }`.
- Monitors (each has `start()`, `stop()`, `status()`): `ClaimMonitor`, `LaunchMonitor`, `GraduationMonitor`, `WhaleMonitor`, `CTOMonitor`, `FeeDistMonitor`.
- Solana: `createRpcConnection({ url, fallbackUrls?, commitment? })` returns an `RpcFallback`; call `.getConnection()` for a `@solana/web3.js` `Connection`. Also `deriveWsUrl`, `PUMP_PROGRAM_ID`, `PUMP_AMM_PROGRAM_ID`, `PUMP_FEE_PROGRAM_ID`, event decoders (`parsePumpLogEvents`, `aggregateTrades`, `decodePumpPool`) and quote helpers (`getBuyQuote`, `getSellQuote`, `getBondingCurveState`).
- Formatters: `formatClaim`, `formatLaunch`, `formatGraduation`, `formatWhaleTrade`, `formatCTO`, `formatFeeDistribution`, plus `shortenAddress`, `formatSol`, `pumpFunToken`, `solscanTx`.
- Config and runtime: `requireEnv`, `optionalEnv`, `parseListEnv`, `parseIntEnv`, `log`, `startHealthServer({ startedAt, getStats? })`, `installShutdownHandlers`, `onShutdown`.
- Storage: `FileStore`, `SqliteStore`, `Store` type.

## Example: claim alert bot

Env: `TELEGRAM_BOT_TOKEN` (from @BotFather), `CHAT_ID` (numeric chat id), `RPC_URL`.

```ts
import {
  createBot, broadcast, ClaimMonitor, createRpcConnection,
  log, requireEnv, installShutdownHandlers, onShutdown,
  shortenAddress,
} from '@pumpkit/core';

const bot = createBot({ token: requireEnv('TELEGRAM_BOT_TOKEN') });
const chatId = Number(requireEnv('CHAT_ID'));
const rpc = createRpcConnection({ url: requireEnv('RPC_URL') });

const monitor = new ClaimMonitor({
  connection: rpc.getConnection(),
  onClaim: async (e) => {
    await broadcast(bot, [chatId], `Fee claim by ${shortenAddress(e.wallet)} on ${e.tokenSymbol ?? e.mint}`);
  },
});

installShutdownHandlers();
onShutdown(() => { monitor.stop(); bot.stop(); });
monitor.start();
await bot.start();
log.info('claim bot running');
```

A `ClaimEvent` has `signature`, `wallet`, `mint`, `amount`, `tokenName?`, `tokenSymbol?`, `timestamp`. Use a dedicated RPC URL: public endpoints rate limit WebSocket subscriptions quickly, and `fallbackUrls` rotates on 429 and 5xx.

## Safety

An on-chain social-fee claim is not developer endorsement. The repo's channel package separates verified repository and creator-wallet relationships from identity mismatches and pooled withdrawals; keep that distinction in any alert copy. Never put a Telegram token or wallet key in committed files.
