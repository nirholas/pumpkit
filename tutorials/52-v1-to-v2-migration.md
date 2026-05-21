# Tutorial 52 — Audit-and-migrate playbook: V1 → V2

> Audience: maintainers of existing pump.fun integrations who have V1 callers and want to support USDC pairs (which require V2) without breaking SOL pair users.
>
> Strategy: **additive migration**. Add V2 alongside V1. Don't ship a breaking change.

## The migration triangle

```text
            ┌─────────────────────────┐
            │     Legacy SOL pair     │
            │   buy / sell V1 ixs     │  ← keep working forever
            └────────────┬────────────┘
                         │
                         │  bridge layer (typed)
                         │
      ┌──────────────────▼──────────────────┐
      │           Trade adapter             │
      │   chooses V1 or V2 per call site    │
      └──────────────────┬──────────────────┘
                         │
            ┌────────────▼────────────┐
            │      USDC pair          │
            │   buy_v2 / sell_v2      │  ← new
            └─────────────────────────┘
```

Goal: every existing call site keeps working; new USDC-pair call sites go through the same adapter.

## Step 1 — Inventory your V1 call sites

Find every place that currently builds a pump.fun instruction or decodes a pump.fun event:

```bash
# Instruction builders
grep -rn --include='*.ts' -E "buildBuy|buildSell|buildCreate|pumpProgram" packages/ examples/ tools/

# Event decoders / log parsers
grep -rn --include='*.ts' -E "TradeEvent|LaunchEvent|CreateEvent|onLogs" packages/

# Constants the program emits
grep -rn --include='*.ts' -E "Program data:|Program log: Instruction" packages/
```

For each match, classify:

| Call site | Direction | Quote currency | Action |
|---|---|---|---|
| Existing trading bot | TX out | SOL only | Keep V1 + add V2 bridge |
| Existing monitor | RX events | both | Add V2 decoder branch |
| New USDC bot | TX out | USDC | V2 only |
| Dashboard indexer | RX events | both | Add `is_v2` boolean + V2 decoder |

## Step 2 — Add a thin trade adapter

```typescript
// packages/core/src/solana/trade-adapter.ts
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import {
  buildBuyV1Ix,
  buildSellV1Ix,
  buildBuyV2Ix,
  buildSellV2Ix,
} from '@nirholas/pump-sdk';

const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

export interface TradeArgs {
  user: PublicKey;
  mint: PublicKey;
  /** For SOL pair, pass undefined or WSOL. For USDC pair, pass the USDC mint. */
  quoteMint?: PublicKey;
  quoteAmount?: bigint;     // for buys
  tokenAmount?: bigint;     // for sells
  minTokensOut?: bigint;
  minQuoteOut?: bigint;
}

function isUsdcPair(quoteMint: PublicKey | undefined): boolean {
  if (!quoteMint) return false;
  return !quoteMint.equals(WSOL_MINT);
}

export async function buildBuy(args: TradeArgs): Promise<TransactionInstruction> {
  if (isUsdcPair(args.quoteMint)) {
    return buildBuyV2Ix({
      buyer:        args.user,
      mint:         args.mint,
      quoteMint:    args.quoteMint!,
      quoteAmount:  args.quoteAmount!,
      minTokensOut: args.minTokensOut!,
    });
  }
  // SOL pair: legacy or V2 — choose by capability flag
  if (process.env.PUMP_FORCE_V2 === '1') {
    return buildBuyV2Ix({
      buyer:        args.user,
      mint:         args.mint,
      quoteMint:    WSOL_MINT,
      quoteAmount:  args.quoteAmount!,
      minTokensOut: args.minTokensOut!,
    });
  }
  return buildBuyV1Ix({
    buyer:       args.user,
    mint:        args.mint,
    solAmount:   args.quoteAmount!,
    minTokensOut: args.minTokensOut!,
  });
}

export async function buildSell(args: TradeArgs): Promise<TransactionInstruction> {
  if (isUsdcPair(args.quoteMint)) {
    return buildSellV2Ix({
      seller:      args.user,
      mint:        args.mint,
      quoteMint:   args.quoteMint!,
      tokenAmount: args.tokenAmount!,
      minQuoteOut: args.minQuoteOut!,
    });
  }
  if (process.env.PUMP_FORCE_V2 === '1') {
    return buildSellV2Ix({
      seller:      args.user,
      mint:        args.mint,
      quoteMint:   WSOL_MINT,
      tokenAmount: args.tokenAmount!,
      minQuoteOut: args.minQuoteOut!,
    });
  }
  return buildSellV1Ix({
    seller:       args.user,
    mint:         args.mint,
    tokenAmount:  args.tokenAmount!,
    minSolOut:    args.minQuoteOut!,
  });
}
```

The adapter is intentionally **explicit**: SOL pair stays on V1 unless `PUMP_FORCE_V2` is set, so existing callers don't change behaviour.

## Step 3 — Update event decoders to handle both

The shipping monitors already use typed V2 decoders for new events. Make sure your custom decoders also handle both:

```typescript
import { decodePumpEvent, EventKind } from '@nirholas/pump-sdk';

connection.onLogs(PUMP_PROGRAM_ID, (log) => {
  for (const line of log.logs) {
    const event = decodePumpEvent(line);
    if (!event) continue;
    switch (event.kind) {
      case EventKind.TradeV1:
        handleTrade({ ...event, isV2: false, quoteMint: WSOL_MINT });
        break;
      case EventKind.TradeV2:
        handleTrade({ ...event, isV2: true });
        break;
      case EventKind.CreateV1:
        handleLaunch({ ...event, isV2: false, quoteMint: WSOL_MINT });
        break;
      case EventKind.CreateV2:
        handleLaunch({ ...event, isV2: true });
        break;
      // ...
    }
  }
}, 'confirmed');
```

Add `isV2` and `quoteMint` to your handler signatures even for V1 events. Downstream code can then ignore the version distinction in most cases.

## Step 4 — Update your data model

If you persist trades / launches, add columns:

```sql
ALTER TABLE pump_trades
  ADD COLUMN is_v2 BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN quote_mint TEXT NOT NULL DEFAULT 'So11111111111111111111111111111111111111112';

CREATE INDEX idx_pump_trades_quote_mint ON pump_trades (quote_mint);
```

Backfill `is_v2` and `quote_mint` for historical rows (all of them are V1/SOL).

## Step 5 — Update your UI

If your dashboard shows trades, add a column for `quote_mint` and surface the symbol (USDC / SOL) per trade. Examples:

- [examples/dashboard.html](../examples/dashboard.html) — add a quote column
- [examples/trades.html](../examples/trades.html) — show "X USDC" or "X SOL" per trade

For Telegram formatters, the symbol matters in the message:

```typescript
function formatTradeAmount(quoteMint: PublicKey, amount: bigint): string {
  if (quoteMint.equals(USDC_MAINNET)) return `${Number(amount) / 1e6} USDC`;
  return `${Number(amount) / 1e9} SOL`;
}
```

## Step 6 — Tests for both paths

Run V1 and V2 paths through your test suite:

```typescript
import { describe, it, expect } from 'vitest';
import { buildBuy } from '@pumpkit/core/solana/trade-adapter';

describe('trade adapter', () => {
  it('routes SOL pair to V1 by default', async () => {
    const ix = await buildBuy({
      user: wallet,
      mint: someCoin,
      quoteAmount: 1_000_000_000n,
      minTokensOut: 1n,
    });
    expect(ix.programId.equals(PUMP_PROGRAM_ID)).toBe(true);
    // Discriminator check — V1 buy has a different first 8 bytes than V2 buy
    expect(ix.data.slice(0, 8)).toEqual(V1_BUY_DISCRIMINATOR);
  });

  it('routes USDC pair to V2', async () => {
    const ix = await buildBuy({
      user: wallet,
      mint: someCoin,
      quoteMint: USDC_MAINNET,
      quoteAmount: 1_000_000n,
      minTokensOut: 1n,
    });
    expect(ix.data.slice(0, 8)).toEqual(V2_BUY_DISCRIMINATOR);
  });

  it('routes SOL pair to V2 when PUMP_FORCE_V2 set', async () => {
    process.env.PUMP_FORCE_V2 = '1';
    const ix = await buildBuy({ user: wallet, mint: someCoin, quoteAmount: 1n, minTokensOut: 1n });
    expect(ix.data.slice(0, 8)).toEqual(V2_BUY_DISCRIMINATOR);
    delete process.env.PUMP_FORCE_V2;
  });
});
```

## Step 7 — Devnet smoke before mainnet

Run the full pipeline against devnet first:

```bash
NETWORK=devnet \
SOLANA_RPC_URL=https://api.devnet.solana.com \
make dev-monitor
```

Make sure:

- V1 SOL pair: still works (legacy users unaffected)
- V2 SOL pair (`PUMP_FORCE_V2=1`): equivalent output
- V2 USDC pair: works end-to-end

## Step 8 — Roll out

Use a feature flag for the cutover:

1. **Phase 0** (week 0): merge adapter, V1 still default. Run shadow logs to compare V1 vs V2 SOL-pair outputs.
2. **Phase 1** (week 1): enable V2 SOL pair for internal/canary users via `PUMP_FORCE_V2=1`.
3. **Phase 2** (week 2): open USDC pair endpoints publicly.
4. **Phase 3** (later): consider deprecating V1 SOL pair if pump.fun ever sunsets it. Today there is no such announcement — assume legacy SOL pair stays indefinitely.

## Common migration mistakes

- **Silently switching all SOL trades to V2.** Some V2 builders may have subtly different account ordering / arg shapes — verify your adapter matches the SDK's typed signatures.
- **Assuming V1 events disappear.** They don't — V1 SOL pair continues to emit V1 events. Your decoder must keep handling them.
- **Adding a `version` enum to old events.** Don't mutate historical rows. Add a column with a default and backfill once.
- **Forgetting WSOL handling.** V2 SOL pair takes `quoteMint = WSOL` but trades still settle in native SOL. Make sure your fee/PnL accounting doesn't double-count wraps/unwraps.
- **Pinning to a pre-V2 SDK.** You'll silently miss V2 events / build paths. Bump.
- **Skipping the test path for the legacy route.** A regression in V1 SOL pair will hurt the biggest cohort of users — keep its tests green.

## Migration completion checklist

- [ ] Inventory of all V1 call sites complete
- [ ] Trade adapter merged
- [ ] Event decoders handle both V1 and V2
- [ ] Data model has `is_v2` + `quote_mint`
- [ ] UI shows quote symbol
- [ ] Tests cover V1, V2 SOL, V2 USDC
- [ ] Devnet smoke passed
- [ ] Phased rollout plan documented
- [ ] SDK version pinned in `package.json`
- [ ] CHANGELOG entry written

## See also

- [tutorials/46-usdc-pair-launches.md](46-usdc-pair-launches.md) — V2 USDC create
- [tutorials/47-v2-creator-fees.md](47-v2-creator-fees.md) — V2 fee instructions
- [tutorials/48-usdc-trading-bot.md](48-usdc-trading-bot.md) — V2-only bot reference
- [tutorials/49-indexing-v2-events.md](49-indexing-v2-events.md) — event decoder considerations
- [docs/migration.md](../docs/migration.md) — the project's migration guide doc
