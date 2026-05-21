---
name: monitor-usdc-pairs
description: Use this skill when wiring or extending a monitor/bot to specifically track USDC-paired pump.fun coins — filtering by quote mint, decoding V2 events, formatting USDC amounts, and forwarding to Telegram or webhooks. Triggers on "monitor USDC pairs", "filter for USDC trades", "USDC launch feed", "track USDC pumps".
---

# Monitor pump.fun USDC-paired coins

## When to use

- The user wants a feed of USDC-pair launches, trades, fee claims, or graduations.
- An existing monitor consumes all pump events and the user wants to filter or split USDC out.
- A Telegram channel / dashboard / webhook consumer needs USDC-pair-specific formatting.

## Key references

- [@pumpkit/core](../../../packages/core/) — `LaunchMonitor`, `WhaleMonitor`, `ClaimMonitor` already exist
- [packages/channel/](../../../packages/channel/) — uses typed V2 decoders (recent refactor)
- [tutorials/49-indexing-v2-events.md](../../../tutorials/49-indexing-v2-events.md) — ingestion approaches at scale
- [tutorials/43-understanding-pumpfun-events.md](../../../tutorials/43-understanding-pumpfun-events.md) — event taxonomy

## Workflow

### 1. Pick the ingestion approach

| Volume | Pick |
|---|---|
| 1 coin, hobby | Public RPC `logsSubscribe` (the default in `LaunchMonitor`) |
| Multi-coin bot | Paid RPC (Helius / Triton) |
| All launches at low latency | Geyser stream |
| Backfill + analytics | Helius webhooks → Postgres, see tutorial 49 |

### 2. Filter for USDC pair

```typescript
import { PublicKey } from '@solana/web3.js';

const USDC_MAINNET = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

function isUsdcPair(event: any): boolean {
  // V1 events have no quoteMint — always SOL pair
  if (!event.quoteMint) return false;
  return event.quoteMint.equals(USDC_MAINNET);
}
```

### 3. Format with the correct decimals

```typescript
function formatQuoteAmount(quoteMint: PublicKey, amount: bigint): string {
  if (quoteMint.equals(USDC_MAINNET)) {
    return `${(Number(amount) / 1e6).toFixed(2)} USDC`;
  }
  // SOL / WSOL: 9 decimals
  return `${(Number(amount) / 1e9).toFixed(4)} SOL`;
}
```

USDC is **6 decimals**, SOL/WSOL is **9**. Mixing them is a frequent bug.

### 4. Wire to the existing monitor

```typescript
import { LaunchMonitor } from '@pumpkit/core';

const monitor = new LaunchMonitor({
  rpcUrl: process.env.SOLANA_RPC_URL!,
  onLaunch: async (event) => {
    if (!isUsdcPair(event)) return;
    await bot.send(USDC_CHAT_ID, formatLaunch(event));
  },
});

await monitor.start();
```

### 5. Don't re-decode bytes by hand

Use the typed V2 decoders from `@nirholas/pump-sdk` (channel/event-monitor refactor commits `1bfec69`, `54768bc`). Hand-rolled byte parsing will drift when the program ships changes.

### 6. Deduplicate

USDC events come in over re-subscribes and Geyser slot replays. Dedup on `(signature, instruction_index)`:

```typescript
const seen = new Set<string>();
function dedupe(sig: string, ix: number) {
  const k = `${sig}:${ix}`;
  if (seen.has(k)) return true;
  seen.add(k);
  return false;
}
```

## Common needs

| User asks for | Recommended pattern |
|---|---|
| "USDC launch feed" | `LaunchMonitor` + USDC filter |
| "USDC trades over $X" | Sample of `WhaleMonitor` + USDC filter + amount threshold |
| "Fee claims by my creator wallet" | `ClaimMonitor` + recipient filter |
| "All-time PnL for my USDC bot" | Indexer with `is_v2 + quote_mint` columns (tutorial 49) |
| "USDC vs SOL pair stats" | Aggregation query on the indexer |

## Avoid

- **Sending USDC amounts formatted with 9 decimals.** Off by 1000x.
- **Reading `event.quoteMint` on V1 events.** It doesn't exist; you'll get `undefined`.
- **Single global subscription for everything.** If one handler throws, none of the others get the event. Wrap each handler in try/catch.
- **Polling `getProgramAccounts`** for "all USDC curves". Expensive and racy. Subscribe to events, persist them, query your DB.

## See also

- [.claude/skills/launch-usdc-pair/SKILL.md](../launch-usdc-pair/SKILL.md) — launch side
- [.claude/skills/index-pump-events/SKILL.md](../index-pump-events/SKILL.md) — indexing at scale
- [tutorials/49-indexing-v2-events.md](../../../tutorials/49-indexing-v2-events.md)
- [packages/core/src/monitor/](../../../packages/core/src/monitor/)
