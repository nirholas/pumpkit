---
name: migrate-v1-to-v2
description: Use this skill when migrating an existing pump.fun integration from V1 SOL-pair to V2 (including USDC pair support). Triggers on phrases like "migrate to V2", "add USDC support to existing", "V1 caller still works but I want V2", "additive migration". Walks through inventory, trade adapter, event decoder updates, data model, UI, tests, phased rollout.
---

# Migrate a pump.fun integration from V1 to V2 (additive)

## When to use

- An existing PumpKit-based or third-party project has V1 SOL pair callers.
- The user wants to add USDC pair support (or general V2 readiness) **without breaking** existing SOL pair users.
- The user is operating an indexer/dashboard that consumes V1 events and needs to also consume V2 events.

## When **not** to use

- Greenfield USDC bot — point at [tutorials/48-usdc-trading-bot.md](../../../tutorials/48-usdc-trading-bot.md) instead. No migration needed.
- The user is happy on V1 forever and doesn't need USDC. Don't push a migration they didn't ask for.

## Core principle

**Additive, not destructive.** V1 SOL pair continues to work indefinitely. V2 is opt-in by quote-mint (USDC) or by env flag (`PUMP_FORCE_V2=1`). The migration adds a thin adapter that routes per call.

## Workflow

### 1. Inventory

```bash
grep -rn --include='*.ts' -E "buildBuy|buildSell|buildCreate|pumpProgram" packages/ examples/ tools/
grep -rn --include='*.ts' -E "TradeEvent|LaunchEvent|onLogs.*PUMP" packages/
```

Classify each match as TX out (need adapter) or RX events (need decoder update).

### 2. Trade adapter

Create [packages/core/src/solana/trade-adapter.ts](../../../packages/core/src/solana/trade-adapter.ts) with `buildBuy` / `buildSell` that route by quote mint. SOL → V1 by default, USDC → V2 always. Env flag (`PUMP_FORCE_V2=1`) forces V2 for SOL pair callers in canary builds.

See [tutorials/52-v1-to-v2-migration.md](../../../tutorials/52-v1-to-v2-migration.md) for the full adapter code.

### 3. Event decoders

Switch on `event.kind`: handle `TradeV1`, `TradeV2`, `CreateV1`, `CreateV2`. Normalise V1 events to include `isV2: false` and `quoteMint: WSOL_MINT` so downstream code can branch uniformly.

### 4. Data model

```sql
ALTER TABLE pump_trades
  ADD COLUMN is_v2 BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN quote_mint TEXT NOT NULL DEFAULT 'So11111111111111111111111111111111111111112';
CREATE INDEX idx_pump_trades_quote_mint ON pump_trades (quote_mint);
```

Backfill historical rows (all are V1/SOL).

### 5. UI / formatters

Show the quote symbol per trade. Don't assume SOL.

### 6. Tests

Cover three paths: V1 SOL, V2 SOL (with flag), V2 USDC. Verify discriminator bytes in the resulting instruction data.

### 7. Phased rollout

| Phase | What | Risk |
|---|---|---|
| 0 | Merge adapter; V1 default; shadow-log V2 comparison | Low |
| 1 | Enable V2 SOL for canary users via flag | Medium |
| 2 | Open USDC pair publicly | Low (USDC is the new surface) |
| 3 | Consider V1 deprecation (only if pump.fun signals it) | High — don't rush |

## Files to touch (likely)

- [packages/core/src/solana/](../../../packages/core/src/solana/) — adapter
- [packages/core/src/monitor/](../../../packages/core/src/monitor/) — decoders
- [packages/core/src/types/events.ts](../../../packages/core/src/types/events.ts) — add `isV2` / `quoteMint`
- [packages/core/src/formatter/templates.ts](../../../packages/core/src/formatter/templates.ts) — show quote symbol
- [packages/channel/](../../../packages/channel/), [packages/monitor/](../../../packages/monitor/) — pass-through
- [examples/dashboard.html](../../../examples/dashboard.html), [examples/trades.html](../../../examples/trades.html) — UI

## Avoid

- **Mutating historical rows.** Backfill once; don't keep rewriting them.
- **Silently changing SOL pair behaviour.** Adapter routes SOL → V1 by default. Force-V2 is opt-in.
- **Skipping V1 tests.** The biggest cohort is still V1 SOL pair. Don't regress them.
- **Adding fix-up code for things that aren't broken.** If a V1 path works, don't refactor it during the migration.

## See also

- Tutorial: [tutorials/52-v1-to-v2-migration.md](../../../tutorials/52-v1-to-v2-migration.md)
- Companion skill: [.claude/skills/launch-usdc-pair/SKILL.md](../launch-usdc-pair/SKILL.md)
- Authoritative docs: [pump-fun/pump-public-docs](https://github.com/pump-fun/pump-public-docs)
