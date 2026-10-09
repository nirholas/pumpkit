# @pumpkit/core — API Reference

> Shared framework modules for building PumpFun Telegram bots.

## Installation

> **Not on the npm registry yet.** `npm install @pumpkit/core` returns 404.
> Build the monorepo once, then install the built workspace by path.

```bash
git clone https://github.com/nirholas/pumpkit.git
(cd pumpkit && npm install && npm run build)

cd my-project
npm install ../pumpkit/packages/core
```

## Modules

---

## `bot/` — Telegram Bot Scaffolding

### `createBot(options): Bot`

Factory function that creates a configured grammy Bot instance with error handling, graceful shutdown, and standard middleware.

```typescript
import { createBot } from '@pumpkit/core';

const bot = createBot({
  token: process.env.TELEGRAM_BOT_TOKEN!,
  commands: {
    start: (ctx) => ctx.reply('Welcome!'),
    help: (ctx) => ctx.reply('Available commands: /start, /help'),
  },
  // Optional
  onError: (err) => console.error('Bot error:', err),
  parseMode: 'HTML',                // Default: 'HTML'
  adminChatIds: [123456789],        // Chat IDs for admin notifications
});

await bot.launch();
```

**Options:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `token` | `string` | ✅ | — | Telegram bot token from BotFather |
| `commands` | `Record<string, CommandHandler>` | ❌ | `{}` | Command handlers |
| `onError` | `(err: Error) => void` | ❌ | `console.error` | Global error handler |
| `parseMode` | `'HTML' \| 'MarkdownV2'` | ❌ | `'HTML'` | Default parse mode |
| `adminChatIds` | `number[]` | ❌ | `[]` | Chat IDs for error notifications |

### `bot.broadcast(chatIds, message, options?)`

Send a message to multiple chat IDs with automatic rate limiting (30 msg/sec Telegram limit).

```typescript
await bot.broadcast([chatId1, chatId2], formatClaim(event));
```

### `bot.notifyAdmins(message)`

Send a message to all admin chat IDs.

---

## `monitor/` — Event Monitors

All monitors extend `BaseMonitor` and share the same lifecycle:

```typescript
const monitor = new ClaimMonitor({ rpcUrl, onEvent });
monitor.start();   // Begin monitoring
monitor.stop();    // Graceful stop
monitor.status();  // { running, lastEvent, eventsProcessed }
```

### `ClaimMonitor`

Detects fee claim events on the PumpFees program.

```typescript
import { ClaimMonitor } from '@pumpkit/core';

const monitor = new ClaimMonitor({
  rpcUrl: process.env.SOLANA_RPC_URL!,
  rpcFallbackUrls: ['https://backup-rpc.example.com'],
  pollIntervalMs: 5000,              // Default: 5000
  onClaim: async (event) => {
    console.log(`${event.wallet} claimed ${event.amount} SOL from ${event.mint}`);
  },
});
```

**ClaimEvent:**

```typescript
interface ClaimEvent {
  signature: string;
  wallet: PublicKey;
  mint: PublicKey;
  amount: BN;           // lamports
  tokenName?: string;
  tokenSymbol?: string;
  timestamp: number;
}
```

### `LaunchMonitor`

Detects new token creations on the Pump program.

```typescript
import { LaunchMonitor } from '@pumpkit/core';

const monitor = new LaunchMonitor({
  rpcUrl: process.env.SOLANA_RPC_URL!,
  onLaunch: async (event) => {
    console.log(`New token: ${event.name} (${event.symbol}) — ${event.mint}`);
  },
});
```

**LaunchEvent:**

```typescript
interface LaunchEvent {
  signature: string;
  mint: PublicKey;
  creator: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  isMayhemMode: boolean;
  hasCashback: boolean;
  timestamp: number;
}
```

### `GraduationMonitor`

Detects bonding curve completions (token graduates to AMM).

```typescript
import { GraduationMonitor } from '@pumpkit/core';

const monitor = new GraduationMonitor({
  rpcUrl: process.env.SOLANA_RPC_URL!,
  onGraduation: async (event) => {
    console.log(`${event.tokenName} graduated! Pool: ${event.poolAddress}`);
  },
});
```

### `WhaleMonitor`

Detects large trades above a configurable SOL threshold.

```typescript
import { WhaleMonitor } from '@pumpkit/core';

const monitor = new WhaleMonitor({
  rpcUrl: process.env.SOLANA_RPC_URL!,
  thresholdSol: 100,    // Minimum SOL value for alert
  onWhaleTrade: async (event) => {
    console.log(`🐋 ${event.side} ${event.solAmount} SOL of ${event.tokenSymbol}`);
  },
});
```

### `CTOMonitor`

Detects Creator Takeover events (fee redirection).

### `FeeDistMonitor`

Detects fee distribution events to shareholders.

---

## `solana/` — Solana Utilities

### `createRpcConnection(options): RpcFallback`

Creates an `RpcFallback` that rotates across fallback URLs. `getConnection()` returns the current Solana `Connection`, and `withFallback(fn)` retries a call on the next URL when one fails.

```typescript
import { createRpcConnection } from '@pumpkit/core';

const rpc = createRpcConnection({
  url: process.env.SOLANA_RPC_URL!,
  fallbackUrls: ['https://backup1.example.com', 'https://backup2.example.com'],
  commitment: 'confirmed',
});
const connection = rpc.getConnection();
```

### Program Constants

```typescript
import { PUMP_PROGRAM_ID, PUMP_AMM_PROGRAM_ID, PUMP_FEE_PROGRAM_ID } from '@pumpkit/core';

// PUMP_PROGRAM_ID     = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
// PUMP_AMM_PROGRAM_ID = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'
// PUMP_FEE_PROGRAM_ID = 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ'
```

### `parsePumpLogEvents(logs): PumpLogEvent[]`

Decodes the trade, completion and fee sweep events out of a transaction's log lines, in emission order. It tracks the invoke stack, so each `Program data:` line is matched against the program that emitted it (Pump and PumpSwap share the sweep instruction names). Dependency-free: no SDK needed.

```typescript
import { parsePumpLogEvents, aggregateTrades, PUMP_PROGRAM_ID } from '@pumpkit/core';
import { PublicKey } from '@solana/web3.js';

connection.onLogs(new PublicKey(PUMP_PROGRAM_ID), ({ logs, err }) => {
  if (err) return;
  const events = parsePumpLogEvents(logs);
  for (const event of events) {
    switch (event.type) {
      case 'trade':           // TradeEvent (every buy/sell version, multi-hop curve hops included)
      case 'postCompleteBuy': // pool part of a buy that completed the curve (synthetic migration)
      case 'complete':        // CompleteEvent: the curve graduated
      case 'sweep':           // SweepBondingCurveFeeEvent or SweepPoolFeeEvent
    }
  }
  // One entry per trade, with a synthetic-migration buy's pool part folded in.
  for (const trade of aggregateTrades(events)) {
    console.log(trade.ixName, trade.isBuy ? 'buy' : 'sell', trade.solAmount, trade.tokenAmount,
      trade.syntheticMigration ? '(completed the curve)' : '');
  }
});
```

`onLogs` only delivers the log lines of the program you subscribe to, so subscribe to `PUMP_AMM_PROGRAM_ID` as well to see PumpSwap sweeps. Amounts are `bigint` in the quote mint's base units.

| Export | Returns |
|--------|---------|
| `decodeTradeEvent(bytes)` | `PumpTradeEvent \| null`. Adds `ixName`, `quoteMint`, `buybackFee`, `creatorFeeUnclaimed`, and `feeKeptOnCurve` (true when a v3 trade left the fee on the curve; `feeRecipient` is then `FEE_KEPT_ON_CURVE_RECIPIENT`) |
| `decodePostCompleteBuyEvent(bytes)` | `PostCompleteBuyEvent \| null` |
| `decodeCompleteEvent(bytes)` | `PumpCompleteEvent \| null` |
| `decodeSweepBondingCurveFeeEvent(bytes)` / `decodeSweepPoolFeeEvent(bytes)` | `SweepFeeEvent \| null`, with `program` (`'pump'` or `'pump-amm'`) and `bucket` (`'protocol'` or `'creator'`) |
| `aggregateTrades(events)` | `AggregatedTrade[]`: the buyer's full amounts and fees, with `syntheticMigration` and `postComplete` |
| `decodePumpPool(data)` | `PumpPoolState \| null` for a PumpSwap `Pool` account: `coinCreator`, signed `virtualQuoteReserves`, and the `protocolFees` / `creatorFees` v2 trades keep in the pool. Fields older, shorter pools lack read as zero |
| `effectivePoolQuoteReserves(vaultAmount, virtualQuoteReserves)` | The quote reserves a pool prices against: quote vault balance plus the signed `virtualQuoteReserves` |

Each single decoder takes the full `Program data:` bytes (discriminator included) and returns `null` on a different discriminator.

The October 2026 instruction and event discriminators are exported too (`BUY_V3_DISCRIMINATOR`, `SELL_V3_DISCRIMINATOR`, `BUY_EXACT_QUOTE_IN_V3_DISCRIMINATOR`, `AMM_BUY_V2_DISCRIMINATOR`, `AMM_SELL_V2_DISCRIMINATOR`, `AMM_BUY_EXACT_QUOTE_IN_V2_DISCRIMINATOR`, `MULTI_HOP_SWAP_DISCRIMINATOR`, `MULTI_HOP_CURVE_SWAP_DISCRIMINATOR`, `SWEEP_PROTOCOL_FEE_DISCRIMINATOR`, `SWEEP_CREATOR_FEE_DISCRIMINATOR`, `POST_COMPLETE_BUY_EVENT_DISCRIMINATOR`, `SWEEP_BONDING_CURVE_FEE_EVENT_DISCRIMINATOR`, `SWEEP_POOL_FEE_EVENT_DISCRIMINATOR`), along with the error codes the upgrade added (`PUMP_ERROR_CODES`, `PUMP_AMM_ERROR_CODES`, `PUMP_FEES_ERROR_CODES`) and `SWEEP_FEE_BUCKET`.

### v3 quotes and creator fee sweeps

These load `@pump-fun/pump-sdk` 4 on first use (an optional peer dependency: `npm install @pump-fun/pump-sdk@^4.0.0`).

```typescript
import { getBuyV3Quote, getBuyV3Cost, getCreatorFeeSweepInstructions } from '@pumpkit/core';
import BN from 'bn.js';

// buy_exact_quote_in_v3: tokens for 0.5 SOL, fees included. A buy past the
// remaining supply continues into the pool (crossesCurve: true).
const quote = await getBuyV3Quote(connection, mint, wallet.publicKey, new BN(500_000_000));

// buy_v3: what 1,000,000 tokens (6 decimals) cost, fees included.
const cost = await getBuyV3Cost(connection, mint, wallet.publicKey, new BN(1_000_000_000_000));

// Sweeps to put first in a creator fee collect transaction.
const sweep = await getCreatorFeeSweepInstructions(connection, mint, wallet.publicKey);
console.log(sweep.curveCreatorFee.toString(), sweep.poolCreatorFee.toString(), sweep.instructions.length);
```

`getBuyV3Quote` / `getBuyV3Cost` return `BuyV3Quote | null` (`null` when the curve is missing or complete). `getCreatorFeeSweepInstructions` returns `CreatorFeeSweep`: the permissionless `sweep_creator_fee` instructions for the curve and, once migrated, the canonical pool, and an empty list when nothing is waiting. Collecting without them misses the fees v3 / v2 trades kept, and fee sharing distribution refuses to run while a creator bucket is nonzero (6095 / 6081 / 6033). See [tutorial 55](../tutorials/55-october-2026-trade-upgrade.md).

---

## `formatter/` — Telegram Message Formatting

### `formatClaim(event): string`

```typescript
import { formatClaim } from '@pumpkit/core';

const html = formatClaim({
  wallet: new PublicKey('...'),
  mint: new PublicKey('...'),
  amount: new BN(2_500_000_000), // 2.5 SOL
  tokenName: 'PumpCoin',
  tokenSymbol: 'PUMP',
});
// Returns HTML string with bold title, amount, links
```

### `formatLaunch(event): string`
### `formatGraduation(event): string`
### `formatWhaleTrade(event): string`
### `formatCTO(event): string`
### `formatFeeDistribution(event): string`

All formatters return HTML strings compatible with Telegram's `parse_mode: 'HTML'`.

### `link(label, url): string`

```typescript
import { link, solscanTx, solscanAccount, pumpFunToken } from '@pumpkit/core';

link('View TX', 'https://...');              // <a href="...">View TX</a>
solscanTx(signature);                        // Solscan transaction link
solscanAccount(address);                     // Solscan account link
pumpFunToken(mint);                          // pump.fun token page link
```

---

## `storage/` — Persistence

### `FileStore`

JSON file persistence. Atomic writes. Survives restarts.

```typescript
import { FileStore } from '@pumpkit/core';

interface Watch { wallet: string; chatId: number; addedAt: number; }

const store = new FileStore<Watch[]>({
  path: 'data/watches.json',
  defaultValue: [],
});

const watches = store.read();
store.write([...watches, { wallet: '...', chatId: 123, addedAt: Date.now() }]);
```

### `SqliteStore`

SQLite adapter using better-sqlite3.

```typescript
import { SqliteStore } from '@pumpkit/core';

const db = new SqliteStore('data/bot.sqlite');
db.exec(`CREATE TABLE IF NOT EXISTS calls (...)`);
const calls = db.query('SELECT * FROM calls WHERE group_id = ?', [groupId]);
db.close();
```

---

## `config/` — Configuration

### `loadConfig(schema): Config`

Loads environment variables with type coercion, defaults, and validation.

```typescript
import { loadConfig, configSchema } from '@pumpkit/core';

const config = loadConfig({
  TELEGRAM_BOT_TOKEN: { type: 'string', required: true },
  SOLANA_RPC_URL: { type: 'string', required: true },
  FEED_CLAIMS: { type: 'boolean', default: true },
  WHALE_THRESHOLD_SOL: { type: 'number', default: 100 },
  API_PORT: { type: 'number', default: 3000 },
  ADMIN_CHAT_IDS: { type: 'string[]', default: [], separator: ',' },
});
```

---

## `health/` — Health Checks

### `createHealthServer(options): http.Server`

```typescript
import { createHealthServer } from '@pumpkit/core';

createHealthServer({
  port: 3000,
  getStats: () => ({
    monitors: monitor.status(),
    watches: store.read().length,
  }),
});

// GET /health → { status: 'ok', uptime: '3600s', monitors: {...} }
```

---

## `logger/` — Logging

### `log`

```typescript
import { log } from '@pumpkit/core';

log.debug('Verbose info');
log.info('Normal operation');
log.warn('Something unusual');
log.error('Something broke', error);
```

Set log level via `LOG_LEVEL` env var: `debug`, `info`, `warn`, `error`.

---

## `api/` — REST API Layer

### `createApiServer(options): Express`

Optional REST API with SSE streaming and webhooks.

```typescript
import { createApiServer } from '@pumpkit/core';

const api = createApiServer({
  port: 3000,
  authToken: process.env.API_AUTH_TOKEN,
  routes: (app) => {
    app.get('/claims', (req, res) => res.json(recentClaims));
    app.get('/status', (req, res) => res.json(monitor.status()));
  },
  sse: {
    path: '/stream',
    events: eventBus,   // Subscribe to monitor events
  },
  webhooks: {
    path: '/webhooks',
    store: webhookStore,
  },
});
```

---

## `social/` — Social Integrations

### `TwitterClient`

```typescript
import { TwitterClient } from '@pumpkit/core';

const twitter = new TwitterClient({ bearerToken: process.env.TWITTER_BEARER_TOKEN! });
const { followers, followsInfluencers } = await twitter.getUserInfo('@handle');
```

### `GitHubClient`

```typescript
import { GitHubClient } from '@pumpkit/core';

const github = new GitHubClient({ token: process.env.GITHUB_TOKEN });
const socialFeePda = await github.lookupSocialFee(mint);
```

---

## Types

### Core Event Types

```typescript
import type {
  ClaimEvent,
  LaunchEvent,
  GraduationEvent,
  WhaleTradeEvent,
  CTOEvent,
  FeeDistEvent,
  PumpEvent,
} from '@pumpkit/core';
```

### Monitor Types

```typescript
import type {
  MonitorOptions,
  MonitorStatus,
  BaseMonitorConfig,
} from '@pumpkit/core';
```

### Config Types

```typescript
import type {
  BotConfig,
  MonitorConfig,
  TrackerConfig,
  ConfigSchema,
} from '@pumpkit/core';
```
