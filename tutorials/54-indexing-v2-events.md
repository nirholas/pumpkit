# Tutorial 54 — Indexing pump.fun V2 events at scale

> Audience: developers running multi-coin monitors, dashboards, or trading bots who have outgrown a single RPC websocket.
>
> When to use: when your single-node `logsSubscribe` is dropping events, lagging > 2 seconds, or you need historical replay.

## The four event-ingestion approaches

| Approach | Latency | Cost | Reliability | Setup time |
|---|---|---|---|---|
| Public RPC `logsSubscribe` | 1–5s | Free → cheap | Drops events under load | 5 min |
| Paid RPC `logsSubscribe` (Helius, Triton, QuickNode) | 0.5–2s | $50–500/mo | Better; still buffered | 30 min |
| Geyser plugin (gRPC stream) | 50–500ms | $200–2000/mo | Best; raw account writes | 2–4 hrs |
| Indexer with replay (Helius webhooks, custom indexer) | 0.5–3s | $100+/mo | Best; supports backfill | 1 day |

PumpKit's existing monitors ([packages/core/src/monitor/](../packages/core/src/monitor/)) use approach #1 by default. For a USDC trading bot or a creator-fee monitor with > 100 watched curves, you'll outgrow it.

## Approach 1 — RPC `logsSubscribe` (the default)

The shipped monitors do this. Reference:

- [packages/core/src/monitor/LaunchMonitor.ts](../packages/core/src/monitor/LaunchMonitor.ts)
- [packages/core/src/monitor/WhaleMonitor.ts](../packages/core/src/monitor/WhaleMonitor.ts)
- [packages/core/src/monitor/ClaimMonitor.ts](../packages/core/src/monitor/ClaimMonitor.ts)

Each subscribes via `connection.onLogs(programId, …)` and parses the resulting log lines. The typed V2 event decoders from `@nirholas/pump-sdk` (introduced in commits `1bfec69`, `54768bc`) handle the parsing.

**Pros:** zero new infra, works against any RPC.
**Cons:** every monitor opens its own subscription. With 5 monitors against one RPC you can hit the provider's connection limit. Subscriptions also silently drop on network blips — you'll only notice when no events arrive for an hour.

### Hardening the default

```typescript
// reconnect-on-silence wrapper
import { Connection } from '@solana/web3.js';

export function watchLogs(connection: Connection, programId: PublicKey, onLog: (l: any) => void, opts: {
  silenceMs?: number;
  onReconnect?: (reason: string) => void;
} = {}) {
  let lastEventAt = Date.now();
  let subId: number | null = null;
  const silenceMs = opts.silenceMs ?? 30_000;

  const subscribe = () => {
    subId = connection.onLogs(programId, (log) => {
      lastEventAt = Date.now();
      onLog(log);
    }, 'confirmed');
  };

  const reconnect = (reason: string) => {
    if (subId !== null) connection.removeOnLogsListener(subId).catch(() => {});
    opts.onReconnect?.(reason);
    subscribe();
  };

  subscribe();

  // Silence watchdog — re-subscribe if no event for `silenceMs`
  setInterval(() => {
    if (Date.now() - lastEventAt > silenceMs) reconnect('silence-watchdog');
  }, Math.max(silenceMs / 2, 5_000));
}
```

This trades occasional duplicate events (during reconnect) for resilience to silent drops. Make your downstream handlers idempotent (key by tx signature).

## Approach 2 — Paid RPC `logsSubscribe`

Helius / Triton / QuickNode have higher connection caps and better internal buffering. Drop-in change: set `SOLANA_RPC_URL` to the paid endpoint. The PumpKit monitors are RPC-agnostic.

Specific tips:
- **Helius "enhanced webhooks"** vs `logsSubscribe`: enhanced webhooks deliver parsed events as HTTP POSTs. Easier ops (your bot doesn't need a long-lived socket) but adds ~500ms of latency.
- **Triton's gRPC endpoint** is approach #3 in disguise — see below.
- **QuickNode "Yellowstone"** is similarly gRPC; same notes.

## Approach 3 — Geyser plugin (gRPC stream)

Geyser is the lowest-latency, highest-fidelity path. You subscribe to raw account writes + transaction notifications via gRPC.

### Setting up a client

```typescript
import Client, { CommitmentLevel, SubscribeRequestFilterTransactionsOptions } from '@triton-one/yellowstone-grpc';

const client = new Client(process.env.GEYSER_URL!, process.env.GEYSER_TOKEN!, {});

const stream = await client.subscribe();

stream.on('data', (msg) => {
  if (msg.transaction) {
    const sig = bs58.encode(msg.transaction.transaction.signature);
    const logs = msg.transaction.transaction.meta?.logMessages ?? [];
    if (logs.some((l) => l.includes('Program ' + PUMP_PROGRAM_ID))) {
      // pass through typed V2 decoder from @nirholas/pump-sdk
    }
  }
});

await stream.write({
  transactions: {
    pump: {
      vote: false,
      failed: false,
      accountInclude: [PUMP_PROGRAM_ID.toBase58()],
      accountExclude: [],
      accountRequired: [],
    },
  },
  commitment: CommitmentLevel.CONFIRMED,
});
```

### Throughput characteristics

- One stream comfortably handles **all** pump.fun program activity (currently ~10–100 tx/s across launches + trades).
- Use `commitment: CONFIRMED` for trading bots (low latency). Use `FINALIZED` for accounting/PnL.
- Geyser delivers transactions before they're confirmed by the RPC — your code must tolerate the rare reorg.

### When Geyser is worth it

- You need < 500ms detection-to-decision latency (e.g. sniping).
- You watch enough curves that RPC websockets thrash your connection pool.
- You want raw account writes (curve state, vault balances) without a separate `getAccountInfo` poll.

## Approach 4 — Indexer with replay (Helius webhooks, custom Postgres indexer)

Trading bots want low latency. Dashboards, analytics, and accounting want **completeness and backfill**.

### Helius enhanced webhooks (simplest)

1. Create a webhook in the Helius dashboard for `accountAddresses: [PUMP_PROGRAM_ID]`.
2. Point it at an HTTPS endpoint you control.
3. Helius will POST decoded events; you persist them.

```typescript
// pseudo-code Express handler
app.post('/helius/pump', async (req, res) => {
  const events = req.body;
  for (const e of events) {
    if (e.type === 'TRADE' && e.tokenStandard === 'pump-v2') {
      await db.insert('trades', e);
    }
  }
  res.status(200).send('ok');
});
```

### Custom indexer (Geyser → Postgres)

For full sovereignty:

```text
Geyser stream ──▶ Kafka ──▶ Indexer worker ──▶ Postgres
                                         └──▶ Pub/Sub for live consumers
```

Schema starter:

```sql
CREATE TABLE pump_trades (
  signature TEXT PRIMARY KEY,
  slot BIGINT NOT NULL,
  block_time TIMESTAMPTZ NOT NULL,
  mint TEXT NOT NULL,
  quote_mint TEXT NOT NULL,
  side TEXT CHECK (side IN ('buy', 'sell')),
  user_pubkey TEXT NOT NULL,
  quote_amount NUMERIC(38, 0) NOT NULL,
  token_amount NUMERIC(38, 0) NOT NULL,
  is_v2 BOOLEAN NOT NULL
);

CREATE INDEX idx_pump_trades_mint_time ON pump_trades (mint, block_time DESC);
CREATE INDEX idx_pump_trades_user ON pump_trades (user_pubkey, block_time DESC);
```

For backfill, run a one-off job that walks `getSignaturesForAddress(PUMP_PROGRAM_ID, …)` paginated back to the slot you care about and re-decodes each tx.

## Filtering: V1 vs V2 vs USDC pair

A common request: "I only care about USDC-paired trades."

```typescript
function isUsdcTrade(event: ParsedPumpEvent): boolean {
  return event.kind === 'trade_v2' && event.quoteMint.equals(USDC_MAINNET);
}
```

Watch out:

- **V1 trades have no `quoteMint` field** — they're SOL by definition. Don't try to read `event.quoteMint` on a V1 trade.
- **A V2 trade on a SOL-pair curve has `quoteMint = WSOL`**, not absent. Distinguish from V1 by the event kind, not the mint.
- **`pump-swap` AMM** is a separate program with its own events. If you only want bonding-curve trades, filter on the program id, not the event shape.

## Deduplication

Across approaches, signatures arrive more than once:

- RPC reconnects re-send recent logs.
- Helius webhooks retry on non-2xx.
- Geyser delivers slot-by-slot, and a tx can land in skipped slots (rare).

Always dedup on `(signature, instruction_index)`:

```typescript
const seen = new LRUCache<string, boolean>({ max: 100_000 });
function dedupe(sig: string, ixIndex: number) {
  const k = `${sig}:${ixIndex}`;
  if (seen.has(k)) return true;
  seen.set(k, true);
  return false;
}
```

For long-running indexers, use Postgres' `INSERT … ON CONFLICT DO NOTHING` on the primary key.

## Cost / latency table (rule of thumb)

| Volume | Recommended approach | Monthly $ |
|---|---|---|
| One coin, hobby | Public RPC (free) | $0 |
| 5–10 coins, single bot | Paid RPC (Helius dev plan) | $50 |
| Trading bot, all launches | Geyser + own monitor | $200–500 |
| Dashboard / analytics | Helius enhanced webhooks → Postgres | $100–300 |
| Production indexer w/ history | Geyser → Kafka → Postgres + S3 archive | $500–2000 |

## Operational checklist

- [ ] Metrics: events/sec ingested, drop rate, end-to-end latency (block-time → decoded)
- [ ] Alerts: silence > 30s, RPC errors > 5/min, websocket reconnects > 10/hr
- [ ] Idempotent persistence (dedup on signature)
- [ ] Backfill strategy: how do you replay if you go down for an hour?
- [ ] Schema migrations: events shapes change with the protocol — `is_v2` boolean helps
- [ ] Cost guardrails: kill switch on a runaway indexer

## See also

- [tutorials/43-understanding-pumpfun-events.md](43-understanding-pumpfun-events.md) — event taxonomy
- [tutorials/29-event-parsing-analytics.md](29-event-parsing-analytics.md) — parsing patterns
- [tutorials/21-websocket-realtime-feeds.md](21-websocket-realtime-feeds.md) — websocket fundamentals
- [docs/rpc-best-practices.md](../docs/rpc-best-practices.md) — RPC tuning
- [docs/events-reference.md](../docs/events-reference.md) — event reference
- [packages/core/src/monitor/](../packages/core/src/monitor/) — shipping monitors
