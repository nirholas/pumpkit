# @pumpkit/core — API Reference

> Shared framework modules for building PumpFun Telegram bots. Everything on
> this page is exported from `@pumpkit/core`; the subpaths listed under
> [Subpath imports](#subpath-imports) load a module without the rest.

## Installation

> **Not on the npm registry yet.** `npm install @pumpkit/core` returns 404.
> Build the monorepo once, then install the built workspace by path.

```bash
git clone https://github.com/nirholas/pumpkit.git
(cd pumpkit && npm install && npm run build)

cd my-project
npm install ../pumpkit/packages/core
```

Optional peers, by feature: `grammy` (bot), `@solana/web3.js` (monitors,
RPC, decoders), `better-sqlite3` (`SqliteStore`), `@nirholas/pump-sdk` and
`@pump-fun/pump-sdk` (SDK bridge).

### Subpath imports

| Import | Contents | Peers loaded |
|--------|----------|--------------|
| `@pumpkit/core/logger` | `log`, `setLogLevel`, `getLogLevel` | none |
| `@pumpkit/core/config` | `requireEnv`, `optionalEnv`, `parseListEnv`, `parseIntEnv` (loads `.env`) | none |
| `@pumpkit/core/health` | `startHealthServer`, `stopHealthServer` | none |
| `@pumpkit/core/shutdown` | `onShutdown`, `installShutdownHandlers` | none |
| `@pumpkit/core/formatter` | templates and link helpers | none |
| `@pumpkit/core/http` | `fetchPublic`, `fetchPublicJson`, `isPublicAddress` | none |
| `@pumpkit/core/util` | `retry`, `isTransientError`, `computeBackoffDelay`, `BoundedSet` | none |
| `@pumpkit/core/programs` | program IDs, discriminators, error codes | none |
| `@pumpkit/core/events` | event decoders, `parsePumpLogEvents`, `aggregateTrades` | `@solana/web3.js` |

---

## Bot scaffolding

### `createBot(options): Bot`

Creates a grammy `Bot`, installs an error handler and registers commands.
It does not start polling; call `bot.start()`.

```typescript
import { createBot } from '@pumpkit/core';

const bot = createBot({
  token: process.env.TELEGRAM_BOT_TOKEN!,
  commands: {
    start: (ctx) => ctx.reply('Welcome!'),
    help: (ctx) => ctx.reply('Available commands: /start, /help'),
  },
  onError: (err) => console.error('Bot error:', err),
});

void bot.start();
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | `string` | yes | Telegram bot token from BotFather |
| `commands` | `Record<string, CommandHandler>` | no | Command name to handler |
| `onError` | `(err: unknown) => void` | no | Replaces the default handler, which logs the error |

### `broadcast(bot, chatIds, message, options?)`

Sends one message to several chats, about 28 per second to stay under
Telegram's limit. Resolves with `{ sent, failed }`; a failed chat is logged
and skipped.

```typescript
import { broadcast, formatLaunch } from '@pumpkit/core';

const { sent, failed } = await broadcast(bot, [chatId1, chatId2], html);
```

---

## Monitors

Each monitor subscribes to program logs over the RPC websocket and decodes
the events it reports from their `Program data:` payloads. Callbacks receive
decoded fields only. Amounts are `bigint` base units of `quoteMint`
(lamports when it is SOL or `null`); `timestamp` is unix ms from the event.
web3.js reconnects the websocket and re-subscribes on its own.

```typescript
const monitor = new LaunchMonitor({ connection, onLaunch });
monitor.start();   // subscribe
monitor.stop();    // unsubscribe
monitor.status();  // { running, lastEvent, eventsProcessed }
```

Options common to all monitors: `connection` (a web3.js `Connection`,
required) and `commitment` (default `'confirmed'`). A callback that throws
or rejects is logged and does not affect the monitor.

### `ClaimMonitor` — `onClaim(event: ClaimEvent)`

Pump `collect_creator_fee`, PumpSwap `collect_coin_creator_fee`, Pump and
PumpSwap `claim_cashback`, and PumpFees `claim_social_fee_pda`. Creator
vaults are per creator, so claims name the receiving `wallet` but no mint.

```typescript
interface ClaimEvent {
  signature: string;
  slot: number;
  timestamp: number;
  kind: 'creator_fee' | 'amm_creator_fee' | 'cashback' | 'social_fee';
  program: 'pump' | 'pump-amm' | 'pump-fees';
  wallet: string;
  amount: bigint;
  quoteMint: string | null;
}
```

### `LaunchMonitor` — `onLaunch(event: LaunchEvent)`

Pump `CreateEvent`, from both `create` and `create_v2`.

```typescript
interface LaunchEvent {
  signature: string;
  slot: number;
  timestamp: number;
  mint: string;
  bondingCurve: string;
  creator: string;   // earns creator fees
  user: string;      // paid for the create
  name: string;      // raw on-chain strings: escape before display
  symbol: string;
  uri: string;
  isMayhemMode: boolean;
  hasCashback: boolean;
  quoteMint: string | null;
}
```

### `GraduationMonitor` — `onGraduation(event: GraduationEvent)`

`CompleteEvent` and `CompletePumpAmmMigrationEvent`, merged per mint when
both occur in one transaction. Older coins complete in one transaction and
migrate in a later one, so a mint can produce an event with
`curveCompleted: true` and later one with only `poolAddress`.

```typescript
interface GraduationEvent {
  signature: string;
  slot: number;
  timestamp: number;
  mint: string;
  bondingCurve: string;
  user: string;
  curveCompleted: boolean;
  poolAddress: string | null;
  quoteMint: string | null;
}
```

### `WhaleMonitor` — `onWhaleTrade(event: WhaleTradeEvent)`

SOL-quoted bonding curve trades of at least `minSol` (default 10), with the
pool part of a curve-completing buy folded in.

```typescript
new WhaleMonitor({ connection, minSol: 100, onWhaleTrade: (e) => console.log(e.side, e.solAmount, e.mint) });
```

### `CTOMonitor` — `onCTO(event: CTOEvent)`

Creator changes: `set_creator` (no previous creator in the event),
`admin_cto` and `migrate_to_sharing_config`.

### `FeeDistMonitor` — `onFeeDist(event: FeeDistEvent)`

Creator fee payouts to fee sharing shareholders (`DistributeCreatorFeesEvent`),
with `totalAmount` and each shareholder's `shareBps`.

### Writing your own

Extend `LogsMonitor`, pass the program IDs to subscribe to, and implement
`handleEvents(signature, slot, events)`. Use `this.emit(callback, event)` to
deliver events with error isolation.

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

Decodes the Pump, PumpSwap and PumpFees events PumpKit understands out of a transaction's log lines, in emission order. It tracks the invoke stack, so each `Program data:` line is matched against the program that emitted it (Pump and PumpSwap share the sweep instruction names). Dependency-free: no SDK needed.

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
      case 'create':          // CreateEvent
      case 'ammMigration':    // CompletePumpAmmMigrationEvent: the curve moved to its pool
      case 'creatorChange':   // SetCreatorEvent / AdminCtoEvent / MigrateBondingCurveCreatorEvent
      case 'feeClaim':        // creator fee, PumpSwap creator fee, cashback or social fee claim
      case 'creatorFeeDistribution': // DistributeCreatorFeesEvent
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
| `decodeCreateEvent(bytes)` | `PumpCreateEvent \| null`: name, symbol, uri, mint, creator, mayhem/cashback flags, quote mint |
| `decodeAmmMigrationEvent(bytes)` | `PumpAmmMigrationEvent \| null`, including the new `pool` |
| `decodeCreatorChangeEvent(bytes)` | `CreatorChangeEvent \| null` with `kind` `'set_creator'`, `'admin_cto'` or `'migrate_to_sharing_config'` |
| `decodeFeeClaimEvent(bytes, program)` | `FeeClaimEvent \| null` with `kind` `'creator_fee'`, `'amm_creator_fee'`, `'cashback'` or `'social_fee'` |
| `decodeCreatorFeeDistributionEvent(bytes)` | `CreatorFeeDistributionEvent \| null`: shareholders with `shareBps`, `distributed` |
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

## Formatting

Templates return HTML for Telegram's `parse_mode: 'HTML'`. Every helper
escapes its text argument, so compose helpers by concatenating their output,
not by nesting one inside another.

```typescript
import { formatClaim } from '@pumpkit/core';

const html = formatClaim({
  type: 'claim',
  signature,
  slot,
  blockTime: null,
  claimerWallet: wallet,
  amountLamports: 2_500_000_000n,   // number or bigint
  claimType: 'creator_fee',
  tokenMint: mint,                  // optional
  tokenName: 'PumpCoin',            // optional, escaped
});
```

Also: `formatLaunch`, `formatGraduation`, `formatWhaleTrade`, `formatCTO`,
`formatFeeDistribution`, and the helpers `link`, `bold`, `code`, `italic`,
`solscanTx`, `solscanAccount`, `pumpFunToken`, `dexScreenerToken`,
`shortenAddress`, `formatSol`, `formatQuoteAmount`, `formatNumber`,
`escapeHtml`, `safeHttpUrl`.

---

## Fetching untrusted URLs

```typescript
import { fetchPublic, fetchPublicJson, UnsafeUrlError, HttpLimitError } from '@pumpkit/core';

const metadata = await fetchPublicJson(uri, { timeoutMs: 5_000, maxBytes: 256 * 1024 });
const res = await fetchPublic(webhookUrl, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
```

Only http(s); every resolved address must be public (checked at connect
time); redirects are not followed; one deadline (default 10 s) covers the
whole exchange; bodies are capped (default 1 MiB). `allowPrivateNetwork: true`
is for hosts the operator configured, never for chain or user input.

---

## Storage

### `FileStore<T>`

One JSON document, written atomically (temp file + rename).

```typescript
import { FileStore } from '@pumpkit/core';

const store = new FileStore<string[]>({ path: 'data/watches.json', defaultValue: [] });
store.write([...store.read(), wallet]);
```

### `SqliteStore`

Thin `better-sqlite3` wrapper with WAL enabled.

```typescript
import { SqliteStore } from '@pumpkit/core';

const db = new SqliteStore('data/bot.sqlite');
db.exec('CREATE TABLE IF NOT EXISTS calls (mint TEXT, group_id INTEGER)');
const calls = db.query<{ mint: string }>('SELECT mint FROM calls WHERE group_id = ?', [groupId]);
db.close();
```

---

## Configuration

Importing the config module loads `.env` from the working directory.

```typescript
import { requireEnv, optionalEnv, parseIntEnv, parseListEnv } from '@pumpkit/core';

const token = requireEnv('TELEGRAM_BOT_TOKEN');   // throws when unset or empty
const rpc = optionalEnv('RPC_URL', 'https://api.mainnet-beta.solana.com');
const port = parseIntEnv('PORT', 3000);           // default when unset or not a number
const chats = parseListEnv('CHAT_IDS');           // comma-separated, trimmed
```

---

## Health and shutdown

```typescript
import { startHealthServer, stopHealthServer, onShutdown, installShutdownHandlers } from '@pumpkit/core';

startHealthServer({ startedAt: Date.now(), getStats: () => ({ monitor: monitor.status() }) });
// GET /health → 200 { status: 'ok', uptime, uptimeMs, ...stats }; 503 when stats.degraded is truthy
// Port: PORT, then HEALTH_PORT, then 3000.

onShutdown(() => monitor.stop());
onShutdown(stopHealthServer);
installShutdownHandlers();   // SIGINT / SIGTERM run the handlers in order, then exit
```

---

## Logging

```typescript
import { log, setLogLevel } from '@pumpkit/core';

setLogLevel('debug');                    // default 'info'; the logger does not read LOG_LEVEL itself
log.info('Processing %s', signature);    // printf-style placeholders via util.format
```

---

## Retry

```typescript
import { retry, isTransientError } from '@pumpkit/core';

const result = await retry(() => connection.getSlot(), {
  maxAttempts: 5,
  initialDelayMs: 250,
  shouldRetry: isTransientError,   // the default: 429, 5xx, timeouts, resets
  label: 'getSlot',
});
```
