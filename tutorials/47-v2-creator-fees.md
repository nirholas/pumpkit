# Tutorial 47 — V2 creator fees: collection & sharing

> Audience: creators or platforms that launched coins via V2 and want to collect or split creator fees.
>
> Authoritative spec:
> - [SWEEP_FEES.md](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/SWEEP_FEES.md)
> - [COLLECT_CREATOR_FEE.md](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/COLLECT_CREATOR_FEE.md)
> - [CREATOR_FEE_SHARING.md](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/CREATOR_FEE_SHARING.md)
>
> Estimated time: 30 minutes for a single-recipient collect; 1–2 hours for a sharing setup with monitoring.

## TL;DR

| Goal | Instruction | When to call |
|---|---|---|
| Move fees that v3 / pool v2 trades kept back into the creator vault | `sweep_creator_fee` (Pump, and PumpSwap once migrated) | First, in the same transaction as any collect, distribute or creator change. A no-op when nothing waits. |
| Pay the creator vault out to the creator | `collect_creator_fee` (SOL), `collect_creator_fee_v2` (any quote), `collect_coin_creator_fee` (PumpSwap) | Any time after the sweep. Permissionless. |
| Split fees between several wallets | `create_fee_sharing_config`, then `update_fee_shares` once | Any time after launch, with the sweeps first. |
| Pay a split out | `transfer_creator_fees_to_pump_v2` + `distribute_creator_fees_v2` | Any time, with the sweeps first. |

All of it applies to SOL, USDC and pump-coin quoted coins: the destination account matches the curve's quote mint.

> Since the October 2026 upgrade, `buy_v3` / `sell_v3` and PumpSwap `buy_v2` / `sell_v2` keep the creator fee on the curve (`BondingCurve.creator_fee`) or in the pool (`Pool.creator_fees`) instead of paying it out per trade. A collect without a sweep only pays out what older instructions delivered. See [tutorial 55](55-october-2026-trade-upgrade.md) and [SWEEP_FEES.md](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/SWEEP_FEES.md).

## Why use this

- **Permissionless collection.** Anyone can sweep and collect for a creator; the money can only go to the creator's own vault and wallet.
- **One transaction.** Sweep plus collect for every quote mint fits in a single transaction, so nothing is left behind between steps.
- **No overdraw.** The program pays out exactly what is recorded, never more.
- **Composable splits.** A sharing config pays every shareholder by `share_bps` on each distribution, so a co-creator never needs to chase you for a payout.

## Prerequisites

- A launched coin (see [tutorial 46](46-usdc-pair-launches.md))
- Creator's keypair, funded for transaction fees (0.001 SOL is enough; add rent if a sweep must create a token account)
- An RPC URL: `process.env.SOLANA_RPC_URL` is the convention used elsewhere in this repo
- `@pump-fun/pump-sdk` 4.0.0 or newer and `@pumpkit/core`

## Discovering the SDK surface

```bash
grep -nE "^\s+(sweep|collect|createFeeSharing|updateFeeShares|distributeCreator|buildDistribute)[A-Za-z0-9]*\(" \
  node_modules/@pump-fun/pump-sdk/dist/index.d.ts
```

If the SDK is older than the October 2026 upgrade, bump it:

```bash
npm install @pump-fun/pump-sdk@^4.0.0
```

## Part 1: Collecting creator fees

### Single-recipient collect (creator only)

`getCreatorFeeSweepInstructions` from `@pumpkit/core` reads the curve and the canonical pool and returns a sweep for each bucket that holds a fee (none when nothing waits). `collectCoinCreatorFeeAllQuotesInstructions` then pays out both creator vaults in every supported quote mint.

```typescript
// scripts/collect-creator-fee.ts
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import { OnlinePumpSdk } from '@pump-fun/pump-sdk';
import { getCreatorFeeSweepInstructions } from '@pumpkit/core';

const loadKp = (p: string): Keypair =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, 'utf8'))));

async function main() {
  const conn     = new Connection(process.env.SOLANA_RPC_URL!, 'confirmed');
  const creator  = loadKp(process.env.CREATOR_KEYPAIR!);
  const coinMint = new PublicKey(process.env.COIN_MINT!);

  // 1. Sweep the creator fee v3 curve trades and v2 pool trades kept back.
  const sweep = await getCreatorFeeSweepInstructions(conn, coinMint, creator.publicKey);
  console.log(`Waiting: ${sweep.curveCreatorFee} on the curve, ${sweep.poolCreatorFee} in the pool (${sweep.quoteMint})`);

  // 2. Collect every quote mint from both creator vaults.
  const collect = await new OnlinePumpSdk(conn).collectCoinCreatorFeeAllQuotesInstructions(creator.publicKey);

  const tx = new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }))
    .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 30_000 }))
    .add(...sweep.instructions, ...collect);

  // Simulate first to surface problems without paying for a failed transaction
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
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com \
CREATOR_KEYPAIR=./tmp/creator.json \
COIN_MINT=<launched-coin-mint> \
npx tsx scripts/collect-creator-fee.ts
```

The collect step fetches several accounts in one batch call, so use an RPC that allows `getMultipleAccounts`.

### What happens on chain

A sweep plus collect on a SOL-paired coin logs, in order:

```text
Program log: Instruction: SweepCreatorFee        (curve creator_fee -> creator vault)
Program log: Instruction: CollectCreatorFee      (creator vault -> creator wallet, SOL)
Program log: Instruction: CollectCoinCreatorFee  (PumpSwap creator vault -> creator, if migrated)
Program log: Instruction: CollectCreatorFeeV2    (creator vault -> creator, token quotes)
```

Each sweep emits a `SweepBondingCurveFeeEvent` or `SweepPoolFeeEvent` with `bucket = 1` (creator). Verify with `solana confirm -v <sig>`.

### Handling "no fees to collect"

A sweep with nothing waiting does nothing, and `getCreatorFeeSweepInstructions` leaves it out entirely. A collect on an empty vault succeeds with a zero transfer. Treat both as a no-op in your bot; **do not retry** in a tight loop. Polling every 5 to 15 minutes is plenty for active coins.

## Part 2: Creator fee sharing

Sharing is opted into **after launch** with the Pump Fees program. `create_fee_sharing_config` moves the curve creator (and `pool.coin_creator` if graduated) to a `sharing_config` PDA, and `update_fee_shares` sets the final split once; the admin is revoked afterwards. Both refuse to run while a creator fee still waits (`CreatorFeesNotSwept` 6095 on Pump, 6081 on PumpSwap, `PoolCreatorFeesNotSwept` 6033 on Pump Fees), so each transaction starts with the sweeps.

```typescript
// scripts/share-creator-fees.ts
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import { PUMP_SDK, OnlinePumpSdk, feeSharingConfigPda } from '@pump-fun/pump-sdk';
import { getCreatorFeeSweepInstructions } from '@pumpkit/core';

const loadKp = (p: string): Keypair =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, 'utf8'))));

async function send(conn: Connection, signer: Keypair, tx: Transaction, label: string) {
  tx.instructions.unshift(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 30_000 }),
  );
  const sim = await conn.simulateTransaction(tx, [signer]);
  if (sim.value.err) throw new Error(`${label} simulation failed: ${JSON.stringify(sim.value.err)}\n${sim.value.logs?.join('\n')}`);
  const sig = await sendAndConfirmTransaction(conn, tx, [signer], { commitment: 'confirmed' });
  console.log(`${label}: ${sig}`);
}

async function main() {
  const conn    = new Connection(process.env.SOLANA_RPC_URL!, 'confirmed');
  const creator = loadKp(process.env.CREATOR_KEYPAIR!);
  const mint    = new PublicKey(process.env.COIN_MINT!);
  const collab  = new PublicKey(process.env.COLLAB!);
  const sdk     = new OnlinePumpSdk(conn);

  // 1. Opt in. Sweep first: the creator is about to change, and the program
  //    refuses (6095 / 6081) while creator fees still wait on the curve or pool.
  const sweep = await getCreatorFeeSweepInstructions(conn, mint, creator.publicKey);
  const curve = await sdk.fetchBondingCurve(mint);
  const pool  = curve.complete && sweep.pool ? new PublicKey(sweep.pool) : null;
  await send(conn, creator, new Transaction().add(
    ...sweep.instructions,
    await PUMP_SDK.createFeeSharingConfig({ creator: creator.publicKey, mint, pool }),
  ), 'create_fee_sharing_config');

  // 2. Set the final split (one call; the admin is revoked afterwards). The
  //    creator is now the sharing config PDA, so sweep against that.
  const config  = feeSharingConfigPda(mint);
  const resweep = await getCreatorFeeSweepInstructions(conn, mint, creator.publicKey);
  await send(conn, creator, new Transaction().add(
    ...resweep.instructions,
    await PUMP_SDK.updateFeeShares({
      authority: creator.publicKey,
      mint,
      currentShareholders: [creator.publicKey],
      newShareholders: [
        { address: creator.publicKey, shareBps: 7_000 },
        { address: collab,            shareBps: 3_000 },
      ],
      bondingCurveComplete: curve.complete,
    }),
  ), `update_fee_shares (${config.toBase58()})`);

  // 3. Any time later: sweep, move graduated fees back to the curve vault,
  //    and pay every shareholder. The helper prepends the sweeps itself.
  const { instructions, sweepCount } = await sdk.buildDistributeCreatorFeesInstructions(mint, {
    payer: creator.publicKey,
  });
  console.log(`${sweepCount} sweep(s) included`);
  await send(conn, creator, new Transaction().add(...instructions), 'distribute_creator_fees');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

`updateFeeShares` and `distributeCreatorFees` handle SOL-quoted coins. For a USDC or pump-coin quoted coin, use `updateFeeSharesV2` and pass `quoteMint` and `quoteTokenProgram` (from `OnlinePumpSdk.fetchQuoteTokenProgram`); `buildDistributeCreatorFeesInstructions` takes the same options.

### Rules (from the SDK and the public docs)

- Shares **sum to exactly 10_000 bps**. The SDK throws `InvalidShareTotalError` otherwise.
- At most **10 shareholders**, each with `shareBps > 0` and no duplicates.
- `update_fee_shares` can be called **once** per sharing config.
- For token quotes, `distributeCreatorFeesV2` with `shouldInitializeAta` creates missing shareholder ATAs at the payer's cost.
- A large split can exceed one legacy transaction: send it as a v0 transaction with an address lookup table. `sweepCount` tells you how many leading instructions are sweeps.

### Verify the split

```typescript
import { OnlinePumpSdk } from '@pump-fun/pump-sdk';
const { canDistribute, distributableFees } = await new OnlinePumpSdk(conn).getMinimumDistributableFee(mint);
```

The `sharing_config` account at `feeSharingConfigPda(mint)` lists the shareholders and their `share_bps`.

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

Sweeps and collects are idempotent: on an empty bucket or vault they do nothing. Do not add your own dedup layer unless you are triggering from non-deterministic webhooks.

### Refund / mis-routed fees

If a shareholder closes their quote ATA, a token-quote distribution needs `shouldInitializeAta` to recreate it. You cannot change the split after `update_fee_shares`. Mitigations:

- Use a wallet you control or a multisig as the recipient, not a single fresh wallet.
- Pre-create the ATA with `idempotent` and don't close it.
- If the worst happens, reach out to pump.fun directly — there is no on-chain self-service for re-routing.

## Common pitfalls

- **Collecting without sweeping.** Fees from `buy_v3` / `sell_v3` and pool `buy_v2` / `sell_v2` wait on the curve or pool. A bare collect under-pays; put the sweeps first in the same transaction.
- **Sweeping in a separate transaction.** A v3 trade that lands in between leaves a new creator fee, and distribute or `update_fee_shares` then fails with 6095 / 6033.
- **Missing ATAs for fee-share recipients.** Create them ahead of time — the launch will succeed but fee routing will fail later.
- **Reusing V1 fee handlers.** V1 events and V2 events are distinct types in the SDK; don't union them silently.
- **Calling `update_fee_shares` twice.** It works once per sharing config. Plan the split before you call it.
- **BPS arithmetic.** `7000 + 2500 + 500 = 10_000` ✓. If your math is off, the create ix fails.
- **Collecting too aggressively.** Each collect is a tx fee. For low-volume coins, batch by waiting for `accrued >= rent_exempt + 10 * tx_fee`.

## Production checklist

Before launching with sharing in production:

- [ ] All recipient ATAs pre-created with `createAssociatedTokenAccountIdempotentInstruction`
- [ ] Sharing math verified: `sum(bps) === 10_000`
- [ ] Each recipient wallet backed up
- [ ] Every collect, distribute and creator change starts with `getCreatorFeeSweepInstructions` (or `buildDistributeCreatorFeesInstructions`, which adds the sweeps)
- [ ] End to end on a test coin: create, trade with `buy_v3`, sweep plus distribute, then check each shareholder's balance moved by `share_bps`
- [ ] Monitor wired up and tested with a synthetic event (mock or replay)
- [ ] SDK version pinned

## See also

- October 2026 upgrade: [tutorials/55-october-2026-trade-upgrade.md](55-october-2026-trade-upgrade.md), which explains why fees wait on the curve and pool
- Previous tutorial: [tutorials/46-usdc-pair-launches.md](46-usdc-pair-launches.md) — launching with USDC quote pair
- Companion: [tutorials/53-usdc-trading-bot.md](53-usdc-trading-bot.md) — end-to-end USDC trading bot that uses these primitives
- Companion: [tutorials/54-indexing-v2-events.md](54-indexing-v2-events.md) — indexing V2 fee events at scale
- Fee sharing docs in repo: [docs/fee-sharing.md](../docs/fee-sharing.md), [docs/fee-tiers.md](../docs/fee-tiers.md)
- Cashback/social-fee notes: [docs/cashback.md](../docs/cashback.md), [tutorials/27-cashback-social-fees.md](27-cashback-social-fees.md)
- Authoritative protocol docs: [pump-fun/pump-public-docs](https://github.com/pump-fun/pump-public-docs)
