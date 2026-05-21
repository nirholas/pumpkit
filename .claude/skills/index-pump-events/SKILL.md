---
name: index-pump-events
description: Use this skill when designing or running a pump.fun event indexer — choosing between RPC websockets, paid RPC, Geyser, or webhook indexers; designing the schema; deduplication; backfill; cost/latency tradeoffs. Triggers on "index pump events", "indexer schema", "Geyser stream", "backfill pump trades", "Helius webhooks pump".
---

# Index pump.fun events at scale

## When to use

- Building a dashboard, analytics platform, or trading bot that needs more than one-shot event handling.
- Existing public-RPC `logsSubscribe` is dropping events under load.
- The user wants historical replay (e.g., "all trades for mint X in the last 30 days").
- The user wants a denormalised table they can SQL against.

## Ingestion choice (decision table)

| Volume | Recommendation | Why |
|---|---|---|
| 1 coin, hobby | Public RPC `logsSubscribe` (existing `LaunchMonitor`) | Free; reliability is fine for one watcher |
| 5–10 coins | Paid RPC | More connections, better buffering |
| All launches, real-time | Geyser (Triton Yellowstone, Helius) | Lowest latency; raw account writes |
| Analytics + history | Helius enhanced webhooks → Postgres | Easiest ops; supports replay |
| Self-hosted production | Geyser → Kafka → Postgres + S3 archive | Full sovereignty |

See [tutorials/49-indexing-v2-events.md](../../../tutorials/49-indexing-v2-events.md) for client code per approach.

## Schema starter

```sql
CREATE TABLE pump_trades (
  signature TEXT NOT NULL,
  ix_index INT NOT NULL,
  slot BIGINT NOT NULL,
  block_time TIMESTAMPTZ NOT NULL,
  mint TEXT NOT NULL,
  quote_mint TEXT NOT NULL,
  side TEXT CHECK (side IN ('buy', 'sell')),
  user_pubkey TEXT NOT NULL,
  quote_amount NUMERIC(38, 0) NOT NULL,
  token_amount NUMERIC(38, 0) NOT NULL,
  fee_quote NUMERIC(38, 0) DEFAULT 0,
  is_v2 BOOLEAN NOT NULL,
  PRIMARY KEY (signature, ix_index)
);

CREATE INDEX idx_pump_trades_mint_time ON pump_trades (mint, block_time DESC);
CREATE INDEX idx_pump_trades_user ON pump_trades (user_pubkey, block_time DESC);
CREATE INDEX idx_pump_trades_quote ON pump_trades (quote_mint, block_time DESC);

CREATE TABLE pump_launches (
  signature TEXT PRIMARY KEY,
  slot BIGINT NOT NULL,
  block_time TIMESTAMPTZ NOT NULL,
  mint TEXT NOT NULL UNIQUE,
  creator TEXT NOT NULL,
  quote_mint TEXT NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  uri TEXT NOT NULL,
  is_v2 BOOLEAN NOT NULL,
  creator_fee_shares JSONB
);

CREATE INDEX idx_pump_launches_creator ON pump_launches (creator, block_time DESC);
CREATE INDEX idx_pump_launches_quote ON pump_launches (quote_mint, block_time DESC);
```

## Deduplication

Dedup on `(signature, ix_index)`. Postgres `INSERT ... ON CONFLICT DO NOTHING` is the cheapest way:

```sql
INSERT INTO pump_trades (signature, ix_index, slot, ...)
VALUES ($1, $2, $3, ...)
ON CONFLICT (signature, ix_index) DO NOTHING;
```

In-memory LRU dedup for hot path before hitting Postgres:

```typescript
import { LRUCache } from 'lru-cache';
const seen = new LRUCache<string, boolean>({ max: 100_000 });
```

## Backfill

```typescript
import { Connection, PublicKey } from '@solana/web3.js';

async function backfill(connection: Connection, programId: PublicKey, beforeSig?: string) {
  let cursor = beforeSig;
  while (true) {
    const batch = await connection.getSignaturesForAddress(programId, { before: cursor, limit: 1000 });
    if (batch.length === 0) break;
    for (const { signature } of batch) {
      const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 });
      if (!tx) continue;
      // decode + insert with ON CONFLICT DO NOTHING
    }
    cursor = batch[batch.length - 1].signature;
  }
}
```

**Notes:**
- `getTransaction` is rate-limited on most paid RPCs. Batch + sleep.
- Skip the backfill entirely if you can — use the live stream from t=now and accept that you don't have history.
- For partial backfills, persist a `last_backfilled_slot` watermark and resume from there on next run.

## Schema migrations as the protocol evolves

Pump.fun's event shapes change. Plan for it:

- **Don't** model every event field as a column. Capture the raw payload in a `JSONB` column too, so future migrations can re-decode from raw.
- **Do** add an `event_schema_version INT` column. Bump when the SDK adds a new field you care about.
- **Don't** silently drop unknown fields. Log them, alert if unknown-field rate > 1%.

## Cost guardrails

Indexers love eating money. Limits to add at design time:

- Rate limit `getTransaction` calls per minute. Most providers cap somewhere.
- Cap Kafka topic retention to N days (cheaper than infinite).
- TTL old raw-payload rows to S3 archive after N days; keep aggregates indefinitely.
- Add a `cost_per_event_micro_usd` metric so you notice if a provider price change blows up your bill.

## Common mistakes

- **No primary key.** You'll have duplicates within a week.
- **JSON-only payload, no structured columns.** Querying becomes unbearable.
- **Single-row inserts.** Use `COPY` or batched inserts; per-row inserts cap at ~1k/s.
- **No backfill watermark.** You restart the indexer and re-process the last 30 days.
- **Subscribing to the whole program for one coin.** If you only care about 5 coins, subscribe to those mints, not the program.
- **Ignoring V1 vs V2.** Add `is_v2` from day one. Adding it later requires backfill.

## Avoid

- Sharing your Geyser auth token in commits, logs, or Telegram.
- Letting the indexer write directly to a production analytics DB without a staging table — protocol-shape changes can poison your aggregates.
- Treating the indexer as the source of truth for trading decisions. The chain is the source of truth; the indexer is a derived view.

## See also

- [tutorials/49-indexing-v2-events.md](../../../tutorials/49-indexing-v2-events.md)
- [.claude/skills/monitor-usdc-pairs/SKILL.md](../monitor-usdc-pairs/SKILL.md)
- [docs/events-reference.md](../../../docs/events-reference.md)
- [packages/core/src/monitor/](../../../packages/core/src/monitor/)
