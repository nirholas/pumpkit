# Tutorial 47 — V2 creator fees: collection & sharing

> Audience: creators or platforms that launched coins via V2 and want to collect or split creator fees.
>
> Authoritative spec:
> - [COLLECT_CREATOR_FEE.md](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/COLLECT_CREATOR_FEE.md)
> - [CREATOR_FEE_SHARING.md](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/CREATOR_FEE_SHARING.md)
>
> Estimated time: 30 minutes for a single-recipient collect; 1–2 hours for a sharing setup with monitoring.

## TL;DR

| Goal | Instruction | When to call |
|---|---|---|
| Sweep accrued creator fees to creator's ATA | `collect_creator_fee` | Any time after fees have accrued. Idempotent. |
| Declare a static recipient split (e.g., 70/30) at launch | Sharing fields on `create_v2` | **Only at create time** — not retroactive |
| Re-route fees to a different wallet | Not supported on-chain — change off-chain only | N/A |

Both apply equally to SOL-paired and USDC-paired coins — the destination ATA just matches the curve's quote mint.

## Why use this

- **Idempotent collection.** No more bespoke "drain creator fee" scripts per coin. Same instruction works for V2 SOL and USDC pairs.
- **On-chain auditability.** Sharing splits are committed on creation; downstream platforms can read them deterministically.
- **Less footgun for creators.** No risk of pulling more than the accrued fee balance — the program clamps to the accrued amount.
- **Composable.** Splits apply automatically on every fee accrual, so a co-creator never needs to chase you for a payout.

## Prerequisites

- A V2-launched coin (see [tutorial 46](46-usdc-pair-launches.md))
- Creator's keypair, funded for transaction fees (~0.001 SOL is enough)
- An RPC URL — `process.env.SOLANA_RPC_URL` is the convention used elsewhere in this repo
- For sharing setups: each recipient's pubkey + their existing or pre-created ATA for the quote mint

## Discovering the SDK surface

Names below are representative — confirm against your installed SDK:

```bash
grep -rE "export (function|const|class) (build|make)?(Collect|CreatorFee)" \
  node_modules/@nirholas/pump-sdk/dist | head
```

If the SDK is older than the V2 rollout, bump it:

```bash
npm install @nirholas/pump-sdk@latest
```

## Part 1 — Collecting creator fees

### Single-recipient collect (creator only)

```typescript
// scripts/collect-creator-fee.ts
import {
  Connection,
  Keypair,
  Transaction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import { buildCollectCreatorFeeIx } from '@nirholas/pump-sdk'; // verify exact name

const loadKp = (p: string): Keypair =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, 'utf8'))));

async function main() {
  const conn      = new Connection(process.env.SOLANA_RPC_URL!, 'confirmed');
  const creator   = loadKp(process.env.CREATOR_KEYPAIR!);
  const coinMint  = new (await import('@solana/web3.js')).PublicKey(process.env.COIN_MINT!);
  const quoteMint = new (await import('@solana/web3.js')).PublicKey(process.env.QUOTE_MINT!);

  const ix = await buildCollectCreatorFeeIx({
    creator: creator.publicKey,
    mint:    coinMint,
    quoteMint,
  });

  const tx = new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }))
    .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 30_000 }))
    .add(ix);

  // Simulate first to surface "no fees to collect" without burning a tx
  const sim = await conn.simulateTransaction(tx, [creator]);
  if (sim.value.err) {
    console.error('Simulation failed:', sim.value.err);
    console.error('Logs:', sim.value.logs);
    process.exit(1);
  }

  const sig = await sendAndConfirmTransaction(conn, tx, [creator], { commitment: 'confirmed' });
  console.log('Collected:', sig);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Run with:

```bash
SOLANA_RPC_URL=https://api.devnet.solana.com \
CREATOR_KEYPAIR=./tmp/creator.json \
COIN_MINT=<launched-coin-mint> \
QUOTE_MINT=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr \
npx tsx scripts/collect-creator-fee.ts
```

### What happens on chain

A successful `collect_creator_fee` produces inner instructions roughly like:

```text
Program <pump-program> invoke
  ├─ token::transfer  (curve quote-vault -> creator quote-ATA)  amount = accrued_fee
  └─ <program logs "collect_creator_fee" + amount>
Program <pump-program> success
```

Verify with `solana confirm -v <sig>`.

### Handling "no fees to collect"

If the curve has no accrued fees, the program may either:
- succeed with a zero-amount transfer (cheapest behaviour — verify in logs), or
- return a custom error like `0x178d` ("no fees available").

Treat both as a no-op in your bot; **don't retry** in a tight loop. A reasonable poll cadence is once every 5–15 minutes for active coins, less for idle ones.

## Part 2 — Creator fee sharing

Sharing is declared **at create time**. You can't retroactively add or change a split after launch — the curve was created with the split baked into the curve account.

### Setting shares on `create_v2`

```typescript
import { buildCreateV2Ix } from '@nirholas/pump-sdk';

const ix = await buildCreateV2Ix({
  payer:     deployer.publicKey,
  mint:      mintKp.publicKey,
  quoteMint, // USDC or WSOL
  name:      'My Coin',
  symbol:    'MYC',
  uri:       'https://example.com/metadata.json',
  // Sharing fields per the public-docs spec — names may vary by SDK version
  creatorFeeShares: [
    { recipient: creator.publicKey,   bps: 7000 }, // 70%
    { recipient: collab.publicKey,    bps: 2500 }, //  25%
    { recipient: treasury.publicKey,  bps:  500 }, //  5%
  ],
});
```

### Rules of thumb (verify against the public-docs spec)

- Shares **sum to exactly 10_000 bps** (= 100%). The program rejects partial sums.
- Number of recipients is bounded by the program — typically **≤ 4**. The on-chain layout has a fixed capacity.
- Each recipient must have **(or be able to be auto-created with) an ATA for the quote mint**. If the ATA doesn't exist at fee-payout time, routing fails.
- Recipients **cannot be PDA-only** in some SDK builds. Use a regular keypair-owned wallet unless the docs say otherwise.

### Pre-create recipient ATAs

Belt-and-braces: pre-create ATAs before the launch so fee routing can't fail later for a stupid reason:

```typescript
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } from '@solana/spl-token';

const recipients = [creator.publicKey, collab.publicKey, treasury.publicKey];

const ataIxs = recipients.map((r) =>
  createAssociatedTokenAccountIdempotentInstruction(
    deployer.publicKey,            // payer
    getAssociatedTokenAddressSync(quoteMint, r),
    r,
    quoteMint,
  ),
);

const tx = new Transaction().add(...ataIxs, createV2Ix);
```

### Verify the split is on the curve

```bash
solana account <curve-pda> --url $SOLANA_RPC_URL --output json | jq .
```

Check the deserialized layout (or use a typed accessor from `@nirholas/pump-sdk`) — there should be a `fee_recipients` array matching what you set.

## Part 3 — Monitoring creator-fee events

PumpKit already has a fee-claim monitor in `@pumpkit/core` ([packages/core/src/monitor/ClaimMonitor.ts](../packages/core/src/monitor/ClaimMonitor.ts)). For V2 creator-fee events specifically:

```typescript
import { ClaimMonitor } from '@pumpkit/core';
import { formatClaim } from '@pumpkit/core/formatter/templates';

const monitor = new ClaimMonitor({
  rpcUrl: process.env.SOLANA_RPC_URL!,
  filter: { v2Only: true },        // configure as appropriate for your codebase
  onClaim: async (event) => {
    if (event.kind === 'creator_fee_collected') {
      const message = formatClaim(event);
      await bot.broadcast(message);
    }
  },
});

await monitor.start();
```

### Building a recipient-aware feed

If your bot serves multiple creators, key the broadcast on the recipient pubkey rather than the curve:

```typescript
const RECIPIENTS = new Map<string, string>([
  ['9xz…', '@nirholas'],    // recipient pubkey -> Telegram handle
  ['1ab…', '@collab'],
]);

monitor.onCreatorFeeCollected(async (event) => {
  for (const r of event.recipients) {
    const handle = RECIPIENTS.get(r.pubkey.toBase58());
    if (handle) {
      await bot.send(handle, `💰 ${r.amount} ${event.quoteSymbol} (${r.bps} bps)`);
    }
  }
});
```

## Part 4 — Operational patterns

### Polling vs event-driven collection

| Approach | Pros | Cons | When to use |
|---|---|---|---|
| Cron every N minutes | Simple, predictable | Wastes RPC on idle curves; misses bursty fees | Single coin, low activity |
| Threshold-based (collect when `accrued >= X USDC`) | Avoids dust transactions | Needs read-only RPC poll first | Multi-coin platforms |
| Event-driven (collect on volume spike) | Fastest payout | More moving parts; needs monitor + queue | High-volume launches |

### Idempotency

`collect_creator_fee` is naturally idempotent — calling it on a curve with zero accrued fees is a no-op (or a custom error you should treat as one). Don't add your own dedup layer unless you're triggering from non-deterministic webhooks.

### Refund / mis-routed fees

If a recipient ATA was closed after launch, the program will fail to route. You generally cannot un-set a share. Mitigations:

- Use a wallet you control or a multisig as the recipient, not a single fresh wallet.
- Pre-create the ATA with `idempotent` and don't close it.
- If the worst happens, reach out to pump.fun directly — there is no on-chain self-service for re-routing.

## Common pitfalls

- **Trying to "drain" the curve directly.** The V2 program will reject anything but `collect_creator_fee` for fee withdrawals.
- **Missing ATAs for fee-share recipients.** Create them ahead of time — the launch will succeed but fee routing will fail later.
- **Reusing V1 fee handlers.** V1 events and V2 events are distinct types in the SDK; don't union them silently.
- **Forgetting that creator-fee sharing is launch-time only.** Plan the split before grinding the mint; you can't change it later.
- **BPS arithmetic.** `7000 + 2500 + 500 = 10_000` ✓. If your math is off, the create ix fails.
- **Using a PDA as a recipient.** Some SDK builds reject this. Stick to keypair-owned wallets unless explicitly supported.
- **Collecting too aggressively.** Each collect is a tx fee. For low-volume coins, batch by waiting for `accrued >= rent_exempt + 10 * tx_fee`.

## Production checklist

Before launching with sharing in production:

- [ ] All recipient ATAs pre-created with `createAssociatedTokenAccountIdempotentInstruction`
- [ ] Sharing math verified: `sum(bps) === 10_000`
- [ ] Each recipient wallet backed up
- [ ] Devnet end-to-end: create with sharing → buy → sell → wait for accrual → `collect_creator_fee` → verify each recipient ATA balance increases proportionally
- [ ] Monitor wired up and tested with a synthetic event (mock or replay)
- [ ] SDK version pinned

## See also

- Previous tutorial: [tutorials/46-usdc-pair-launches.md](46-usdc-pair-launches.md) — launching with USDC quote pair
- Companion: [tutorials/48-usdc-trading-bot.md](48-usdc-trading-bot.md) — end-to-end USDC trading bot that uses these primitives
- Companion: [tutorials/49-indexing-v2-events.md](49-indexing-v2-events.md) — indexing V2 fee events at scale
- Fee sharing docs in repo: [docs/fee-sharing.md](../docs/fee-sharing.md), [docs/fee-tiers.md](../docs/fee-tiers.md)
- Cashback/social-fee notes: [docs/cashback.md](../docs/cashback.md), [tutorials/27-cashback-social-fees.md](27-cashback-social-fees.md)
- Authoritative protocol docs: [pump-fun/pump-public-docs](https://github.com/pump-fun/pump-public-docs)
