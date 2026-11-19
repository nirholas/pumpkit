# @pumpkit/core

> Shared framework for building PumpFun Telegram bots on Solana.

[![License](https://img.shields.io/badge/License-see%20LICENSE-blue.svg)](../../LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green)](https://nodejs.org/)

## What is PumpKit Core?

PumpKit Core is the shared foundation for building Telegram bots that monitor and interact with the PumpFun protocol on Solana. It provides event monitors, RPC management, Telegram bot scaffolding, message formatters, persistent storage, and configuration helpers — everything you need to ship a production bot.

## Installation

> **Not on the npm registry yet.** `npm install @pumpkit/core` returns 404.
> Build the monorepo once, then install the built workspace by path.

```bash
git clone https://github.com/nirholas/pumpkit.git
(cd pumpkit && npm install && npm run build)

cd my-project
npm install ../pumpkit/packages/core
```

Peer dependencies (install what you need):

```bash
npm install grammy @solana/web3.js better-sqlite3
```

## Quick Start

```typescript
import {
  ClaimMonitor, createBot, createRpcConnection, formatClaim,
  installShutdownHandlers, log, onShutdown, requireEnv, startHealthServer, stopHealthServer,
} from '@pumpkit/core';

const bot = createBot({ token: requireEnv('TELEGRAM_BOT_TOKEN') });
const chatId = requireEnv('CHAT_ID');
const rpc = createRpcConnection({ url: requireEnv('RPC_URL') });

const monitor = new ClaimMonitor({
  connection: rpc.getConnection(),
  onClaim: async (claim) => {
    const html = formatClaim({
      type: 'claim',
      signature: claim.signature,
      slot: claim.slot,
      blockTime: Math.floor(claim.timestamp / 1000),
      claimerWallet: claim.wallet,
      amountLamports: claim.amount,
      claimType: claim.kind === 'amm_creator_fee' ? 'creator_fee' : claim.kind,
      ...(claim.quoteMint ? { quoteMint: claim.quoteMint } : {}),
    });
    await bot.api.sendMessage(chatId, html, { parse_mode: 'HTML' });
  },
});

onShutdown(async () => {
  monitor.stop();
  await bot.stop();
  await stopHealthServer();
});
installShutdownHandlers();
startHealthServer({ startedAt: Date.now() });
monitor.start();
void bot.start();
log.info('Bot running');
```

## Modules

### `bot/` — Telegram Bot Scaffolding

Create a grammy bot with an error handler and commands, and broadcast to
several chats within Telegram's rate limit.

```typescript
import { createBot, broadcast, onShutdown } from '@pumpkit/core';

const bot = createBot({ token: '...', commands: { start: (ctx) => ctx.reply('gm') } });
onShutdown(() => bot.stop());
await broadcast(bot, [chatId], '<b>Hello!</b>');
```

### `monitor/` — Event Monitors

Six monitors that follow program logs over the RPC websocket and decode each
event from its `Program data:` payload. Callbacks receive decoded fields only;
nothing is filled with placeholders. Amounts are `bigint` base units.

| Monitor | Callback | Events decoded | Programs |
|---------|----------|----------------|----------|
| `ClaimMonitor` | `onClaim` | CollectCreatorFeeEvent, CollectCoinCreatorFeeEvent, ClaimCashbackEvent, SocialFeePdaClaimed | Pump, PumpSwap, PumpFees |
| `LaunchMonitor` | `onLaunch` | CreateEvent (`create` / `create_v2`) | Pump |
| `GraduationMonitor` | `onGraduation` | CompleteEvent, CompletePumpAmmMigrationEvent | Pump |
| `WhaleMonitor` | `onWhaleTrade` | TradeEvent (+ PostCompleteBuyEvent), SOL-quoted, above `minSol` | Pump |
| `CTOMonitor` | `onCTO` | SetCreatorEvent, AdminCtoEvent, MigrateBondingCurveCreatorEvent | Pump |
| `FeeDistMonitor` | `onFeeDist` | DistributeCreatorFeesEvent | Pump |

All monitors extend `LogsMonitor` (itself a `BaseMonitor`) and provide
`.start()`, `.stop()` and `.status()`. web3.js reconnects the websocket and
re-subscribes on its own. On-chain events do not carry token names for
claims, graduations or trades; look those up when a message needs them, and
escape any metadata string before sending it.

### `solana/` — RPC Connection & Program IDs

```typescript
import {
  createRpcConnection, RpcFallback, deriveWsUrl,
  PUMP_PROGRAM_ID, PUMP_AMM_PROGRAM_ID, PUMP_FEE_PROGRAM_ID,
} from '@pumpkit/core';

const rpc = createRpcConnection({
  url: 'https://rpc1.example.com',
  fallbackUrls: ['https://rpc2.example.com'],
});
const connection = rpc.getConnection();
const wsUrl = deriveWsUrl('https://api.mainnet-beta.solana.com');
```

### `solana/events`: Pump and PumpSwap Event Decoders

Dependency-free decoders for the events the October 2026 upgrade changed or added, and a log parser that matches each `Program data:` line to the program that emitted it.

```typescript
import { parsePumpLogEvents, aggregateTrades, decodePumpPool, effectivePoolQuoteReserves } from '@pumpkit/core';

const events = parsePumpLogEvents(tx.meta.logMessages); // trade, create, complete, feeClaim, sweep, ...
const trades = aggregateTrades(events);                 // a buy that completed the curve, folded into one trade

const pool = decodePumpPool(poolAccount.data);          // coinCreator, signed virtualQuoteReserves, kept fees
```

Single decoders: `decodeTradeEvent`, `decodePostCompleteBuyEvent`, `decodeCompleteEvent`, `decodeCreateEvent`, `decodeAmmMigrationEvent`, `decodeCreatorChangeEvent`, `decodeFeeClaimEvent`, `decodeCreatorFeeDistributionEvent`, `decodeSweepBondingCurveFeeEvent`, `decodeSweepPoolFeeEvent`. The v3 / v2 trade, multi-hop and sweep instruction discriminators and the new error codes are exported as constants.

### `solana/sdk-bridge` — Pump SDK Wrappers

```typescript
import {
  getTokenPrice, getBuyQuote, getGraduationProgress,
  getBuyV3Quote, getBuyV3Cost, getCreatorFeeSweepInstructions,
} from '@pumpkit/core';
```

`getBuyV3Quote` / `getBuyV3Cost` quote `buy_exact_quote_in_v3` / `buy_v3`, including a buy that completes the curve and continues into the pool. `getCreatorFeeSweepInstructions` returns the `sweep_creator_fee` instructions (curve and canonical pool) to put in front of a creator fee collect. These three load the optional peer `@pump-fun/pump-sdk` 4 on first use. Full reference: [docs/core-api.md](../../docs/core-api.md#v3-quotes-and-creator-fee-sweeps).

### `formatter/` — Telegram HTML Templates

Notification templates for each event type, plus link helpers. Every helper
escapes its text, so token names and URLs from chain metadata cannot inject
markup. `escapeHtml()` and `safeHttpUrl()` are exported for hand-built
messages.

```typescript
import { formatLaunch, formatWhaleTrade, solscanTx, shortenAddress, escapeHtml } from '@pumpkit/core';
```

### `net/http` — Fetching Untrusted URLs

`fetchPublic()` / `fetchPublicJson()` fetch metadata URIs and webhook targets
safely: http(s) only, public addresses only (checked at connect time, so DNS
rebinding does not get around it), no redirects, one deadline for the whole
exchange and a body size cap.

```typescript
import { fetchPublicJson } from '@pumpkit/core/http';

const metadata = await fetchPublicJson(uri, { timeoutMs: 5_000, maxBytes: 256 * 1024 });
```

### `storage/` — Persistent Storage

```typescript
import { FileStore, SqliteStore } from '@pumpkit/core';

// JSON file persistence with atomic writes
const fileStore = new FileStore<string[]>({ path: './data/seen.json', defaultValue: [] });

// SQLite with WAL mode
const db = new SqliteStore('./data/bot.db');
db.exec('CREATE TABLE IF NOT EXISTS claims (sig TEXT PRIMARY KEY)');
```

### `config/` — Environment Variables

```typescript
import { requireEnv, optionalEnv, parseIntEnv, parseListEnv } from '@pumpkit/core';

const token = requireEnv('BOT_TOKEN');          // throws if missing
const rpc = optionalEnv('RPC_URL', 'https://api.mainnet-beta.solana.com');
const port = parseIntEnv('PORT', 3000);
const chats = parseListEnv('CHAT_IDS');         // comma-separated → string[]
```

### `health/` — Health Check Server

```typescript
import { startHealthServer, stopHealthServer } from '@pumpkit/core';

startHealthServer({ startedAt: Date.now() });
```

### `logger/` — Leveled Logger

```typescript
import { log, setLogLevel } from '@pumpkit/core';

setLogLevel('debug');
log.info('Bot started');
log.debug('Processing event %s', signature);
```

## Subpath Imports

The root entry loads every module, including the optional peers `grammy`,
`@solana/web3.js` and `better-sqlite3`. Import a subpath to load only what
you use: `@pumpkit/core/logger`, `/config`, `/health`, `/shutdown`,
`/formatter`, `/http`, `/util` (no peers), and `/events`, `/programs`
(`@solana/web3.js`).

## Configuration Schema

All PumpKit bots use environment variables. Common variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | — | Telegram Bot API token |
| `CHAT_IDS` | Yes | — | Comma-separated chat IDs |
| `RPC_URL` | No | mainnet-beta | Solana RPC endpoint |
| `LOG_LEVEL` | No | `info` | `debug` \| `info` \| `warn` \| `error` |
| `PORT` | No | `3000` | Health check server port |

## Built With

- [grammy](https://grammy.dev/) — Telegram Bot framework
- [@solana/web3.js](https://solana-labs.github.io/solana-web3.js/) — Solana RPC client
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — Synchronous SQLite
- [dotenv](https://github.com/motdotla/dotenv) — Environment variable loading

## Pre-Built Bots

- **@pumpkit/channel** — PumpFun activity monitor (launches, graduations, whale trades)
- **@pumpkit/claim** — Fee claim tracker bot
- **@pumpkit/web** — React dashboard UI

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## License

See the repository [LICENSE](../../LICENSE) file for terms.
