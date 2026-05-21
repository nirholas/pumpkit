# Tutorial 47 — V2 creator fees: collection & sharing

> Audience: creators or platforms that launched coins via V2 and want to collect or split creator fees.
>
> Authoritative spec:
> - [COLLECT_CREATOR_FEE.md](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/COLLECT_CREATOR_FEE.md)
> - [CREATOR_FEE_SHARING.md](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/CREATOR_FEE_SHARING.md)

## What's new

The V2 instruction set added explicit creator-fee primitives so creators don't have to pull fees out of a curve account by hand. There are two related instructions:

| Instruction | What it does |
|---|---|
| `collect_creator_fee` | Sweeps accrued creator fees from a curve to the creator's destination ATA |
| Creator fee sharing | Lets the creator declare a static split (e.g., 70/30) between two or more parties at create time, so fees route automatically |

Both apply equally to SOL-paired and USDC-paired coins — the destination ATA is just denominated in the relevant quote mint.

## Why use this

- **Idempotent collection.** No more bespoke "drain creator fee" scripts per coin.
- **On-chain auditability.** Sharing splits are committed on creation; downstream platforms can read them.
- **Less footgun for creators.** No risk of pulling more than the accrued fee balance.

## Prerequisites

- A V2-launched coin (see [tutorial 46](46-usdc-pair-launches.md))
- Creator's keypair, funded for transaction fees
- An RPC URL — `process.env.SOLANA_RPC_URL` is the convention used elsewhere in this repo

## Collecting creator fees

```typescript
import { Connection, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { buildCollectCreatorFeeIx } from '@nirholas/pump-sdk'; // verify exact name in your installed SDK

const connection = new Connection(process.env.SOLANA_RPC_URL!, 'confirmed');
const creator    = Keypair.fromSecretKey(/* … */);
const coinMint   = /* pubkey of the V2-launched coin */;
const quoteMint  = /* WSOL or USDC, matching the launch */;

const ix = await buildCollectCreatorFeeIx({
  creator: creator.publicKey,
  mint:    coinMint,
  quoteMint,
});

const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [creator]);
console.log('Collected creator fee:', sig);
```

Read the SDK's exported type for the exact arg shape; the call above is representative, not literal. If your installed version doesn't have `buildCollectCreatorFeeIx`, bump it:

```bash
npm install @nirholas/pump-sdk@latest
```

## Creator fee sharing — set up at launch

Sharing is declared **at create time**. You can't retroactively add or change a split after launch — the curve was created with the split baked in.

```typescript
import { buildCreateV2Ix } from '@nirholas/pump-sdk';

const ix = await buildCreateV2Ix({
  payer:     deployer.publicKey,
  mint:      mintKp.publicKey,
  quoteMint, // USDC or WSOL
  name:      'My Coin',
  symbol:    'MYC',
  uri:       'https://…/metadata.json',
  // Sharing fields per the public-docs spec — names vary by SDK version
  creatorFeeShares: [
    { recipient: creator.publicKey, bps: 7000 }, // 70%
    { recipient: collab.publicKey,  bps: 3000 }, // 30%
  ],
});
```

Rules of thumb (verify against the public-docs spec):

- Shares sum to 10_000 bps (= 100%).
- Number of recipients is bounded by the program — keep it small (typically ≤ 4).
- Each recipient must have an ATA for the quote mint, or the routing will fail.

## Monitoring fee claims

PumpKit already has a fee-claim monitor in `@pumpkit/core` ([packages/core/src/monitor/ClaimMonitor.ts](../packages/core/src/monitor/ClaimMonitor.ts)). For V2 creator-fee events specifically:

1. Check the SDK's V2 event types (`ls node_modules/@nirholas/pump-sdk/dist | grep -iE 'creator|fee'`).
2. The channel and event-monitor already use typed V2 decoders (recent refactor in commit `1bfec69`) — use them as the wiring template.
3. Format with the project's link helper:

```typescript
import { formatClaim } from '@pumpkit/core/formatter/templates';

monitor.onCreatorFeeCollected((event) => {
  bot.broadcast(formatClaim(event));
});
```

## Verifying a creator fee on chain

After a `collect_creator_fee` lands, you can verify on chain with:

```bash
solana confirm -v <signature> --url $SOLANA_RPC_URL
```

The transaction's inner instructions should show:
- A transfer from the curve's quote-token vault to the creator's quote-token ATA.
- A program log line referencing `collect_creator_fee` (exact text varies by program version).

## Common pitfalls

- **Trying to "drain" the curve directly.** The V2 program will reject anything but `collect_creator_fee` for fee withdrawals.
- **Missing ATAs for fee-share recipients.** Create them ahead of time — the launch will succeed but fee routing will fail later.
- **Reusing V1 fee handlers.** V1 events and V2 events are distinct types in the SDK; don't union them silently.
- **Forgetting that creator-fee sharing is launch-time only.** Plan the split before grinding the mint; you can't change it later.

## See also

- Previous tutorial: [tutorials/46-usdc-pair-launches.md](46-usdc-pair-launches.md)
- Fee sharing docs in repo: [docs/fee-sharing.md](../docs/fee-sharing.md), [docs/fee-tiers.md](../docs/fee-tiers.md)
- Cashback/social-fee notes: [docs/cashback.md](../docs/cashback.md), [tutorials/27-cashback-social-fees.md](27-cashback-social-fees.md)
- Authoritative protocol docs: [pump-fun/pump-public-docs](https://github.com/pump-fun/pump-public-docs)
