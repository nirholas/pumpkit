---
name: jito-bundles
description: Use this skill any time the user is sending, debugging, or designing a Jito bundle in PumpKit. Triggers on "Jito bundle", "block engine", "tip account", "atomic multi-tx", "co-block", "sendBundle", "bundle ID", "bundle didn't land", and any flow that needs all-or-nothing execution across multiple txs (launches, multi-wallet entries, rescue flows). Skip for single-tx sends — a normal priority-fee tx is fine there.
---

# Jito bundles for PumpKit

This skill is the project-specific reference for building, submitting, debugging, and tuning Jito bundles. Companion: [tutorials/48-jito-bundle-strategies.md](../../../tutorials/48-jito-bundle-strategies.md).

## The non-negotiables

1. **5 transactions max** per bundle, one of which is the tip transfer.
2. **All or nothing** — bundle lands atomically in one slot or every tx is dropped.
3. **Order is preserved** within the bundle.
4. **Tip must be inside the bundle** (system-transfer to a Jito tip account). Tip outside the bundle defeats the entire mechanism.
5. **Bundles can silently drop.** No error, no log. Always have a retry path.

## When to bundle vs. when to single-send

| Flow | Bundle? | Why |
|---|---|---|
| Create coin + immediate buy | **Yes** | Defeats co-block snipers; atomic |
| Multi-wallet first-buy (N wallets) | **Yes** | Partial entry skews cost basis |
| Single trade on a liquid coin | No | Bundle overhead isn't worth it |
| Rescue + transfer from leaked keypair | **Yes** | Must beat the leaker; atomic |
| Sell on a graduating coin | **Sometimes** | Bundle if competing with snipers |
| Routine rebalances | No | Single tx with priority fee suffices |

## Tip strategy

Tip is *the* lever for landing odds. It is paid only on success but competes with every other bundle targeting that slot.

### Reference points (2026)

| Landing target | Typical tip |
|---|---|
| Background (best-effort) | 0.0001 – 0.0005 SOL |
| Normal sniper | 0.001 – 0.005 SOL |
| Contested launch | 0.01 – 0.05 SOL |
| Whale defence | 0.1+ SOL |

### Adaptive picker

```typescript
async function pickTip(urgency: 'low' | 'med' | 'high'): Promise<number> {
  const p = await getRecentJitoTipPercentiles(); // p50/p75/p95/p99 in lamports
  const base = urgency === 'high' ? p.p95
             : urgency === 'med'  ? p.p75
             :                      p.p50;
  return Math.min(base, 0.1 * LAMPORTS_PER_SOL); // hard cap
}
```

### Anti-patterns

- **Hardcoded tips.** They go stale; network conditions change hour by hour.
- **Tips without caps.** A spiking percentile can drain your budget if you blindly follow it.
- **No retry-with-higher-tip path.** First send fails silently → bot waits forever.

## The 8 Jito mainnet tip accounts

```
96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5
HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe
Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY
ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49
DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh
ADuUkR4vqLUMWXxW9gh6D6L8pivKeVQqoZjfFp9LVD8e
DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL
3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT
```

Pick one at random per bundle to avoid contention on a single account. Devnet has its own set — confirm via Jito docs before testing.

## Submitting a bundle

```typescript
import { searcherClient } from 'jito-ts/dist/sdk/block-engine/searcher.js';
import { Bundle }         from 'jito-ts/dist/sdk/block-engine/types.js';
import {
  Connection, Keypair, Transaction, SystemProgram,
  PublicKey, LAMPORTS_PER_SOL,
} from '@solana/web3.js';

const TIP_ACCOUNTS = [/* see list above */].map(s => new PublicKey(s));

export async function sendBundle({
  conn, blockEngineUrl, payer, txs, tipLamports,
}: {
  conn: Connection;
  blockEngineUrl: string;
  payer: Keypair;
  txs: Transaction[];       // each must be signed by its respective signer(s)
  tipLamports: number;
}): Promise<{ bundleId: string; signatures: string[] }> {
  if (txs.length > 4) {
    throw new Error('Leave room for tip tx (5 max incl. tip)');
  }

  const { blockhash } = await conn.getLatestBlockhash('confirmed');

  // Stamp blockhash on any txs that don't have one yet.
  for (const tx of txs) {
    tx.recentBlockhash ??= blockhash;
    if (!tx.signatures.length) {
      throw new Error('Caller must sign each tx before bundling');
    }
  }

  const tipAccount = TIP_ACCOUNTS[Math.floor(Math.random() * TIP_ACCOUNTS.length)];
  const tipTx = new Transaction({ recentBlockhash: blockhash, feePayer: payer.publicKey })
    .add(SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey:   tipAccount,
      lamports:   tipLamports,
    }));
  tipTx.sign(payer);

  const client = searcherClient(blockEngineUrl);
  const bundle = new Bundle([...txs, tipTx], 5);
  const bundleId = await client.sendBundle(bundle);

  const signatures = [...txs, tipTx].map(t => t.signatures[0].signature!.toString('base58'));
  return { bundleId, signatures };
}
```

## Confirming a bundle landed

```typescript
async function waitForBundle(
  conn: Connection,
  sigs: string[],
  timeoutMs = 30_000,
): Promise<{ landed: boolean; slot?: number }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { value } = await conn.getSignatureStatuses(sigs);
    if (value.every(s => s?.confirmationStatus === 'confirmed' || s?.confirmationStatus === 'finalized')) {
      return { landed: true, slot: value[0]!.slot };
    }
    if (value.some(s => s?.err)) {
      return { landed: false }; // a tx reverted — bundle dropped
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return { landed: false };
}
```

For a deeper trace (which slot, what tip was paid, whether the bundle made it to the leader), use the `/bundle-trace` command.

## Why bundles drop — the checklist

1. **Stale blockhash.** All txs must share a recent blockhash and be sent within ~60s of fetching it.
2. **Tip too low.** No status, no error — silent drop. Bump and retry.
3. **Tx inside the bundle reverted.** First revert kills the whole bundle.
4. **Compute-unit limit exceeded.** Use `ComputeBudgetProgram.setComputeUnitLimit` explicitly per tx.
5. **More than 5 txs total** (including tip). Caller miscounted.
6. **Wrong block engine endpoint.** Mainnet vs devnet — they share no state.
7. **Tip tx outside the bundle.** Doesn't satisfy the bundle contract.
8. **Mismatched signers.** Each tx must be signed by *its* required signers before submission.

## Worked example: defended launch

```typescript
// 1. Pre-fetch state
const blockhash = (await conn.getLatestBlockhash('confirmed')).blockhash;
const tip = await pickTip('high');

// 2. Build the 4 work txs
const createTx = await buildCreateV2Tx({ deployer, mint: mintKp, quoteMint: USDC_MINT, blockhash });
const buyA    = await buildBuyV2Tx({ wallet: walletA, mint: mintKp.publicKey, usdcIn: 1_000_000n, blockhash });
const buyB    = await buildBuyV2Tx({ wallet: walletB, mint: mintKp.publicKey, usdcIn: 1_000_000n, blockhash });
const buyC    = await buildBuyV2Tx({ wallet: walletC, mint: mintKp.publicKey, usdcIn: 1_000_000n, blockhash });

createTx.sign(deployer, mintKp);
buyA.sign(walletA);
buyB.sign(walletB);
buyC.sign(walletC);

// 3. Bundle (sendBundle appends the tip tx)
const { bundleId, signatures } = await sendBundle({
  conn,
  blockEngineUrl: process.env.JITO_BLOCK_ENGINE_URL!,
  payer: deployer,
  txs: [createTx, buyA, buyB, buyC],
  tipLamports: tip,
});

// 4. Confirm
const { landed, slot } = await waitForBundle(conn, signatures);
if (!landed) {
  // Retry with bumped tip
  return retryWithHigherTip();
}
console.log(`Bundle ${bundleId} landed in slot ${slot}`);
```

## Cost accounting

Per landed bundle:

```
cost  = Σ(tx_priority_fees_actually_consumed) + tip
edge  = entry_pnl − cost − acceptable_risk_margin
```

If you're regularly negative on landed bundles, your tip is too high relative to your edge. If you're negative on unlanded bundles, you're likely overpaying for priority fees that don't land you in the slot you needed.

## Avoid

- **Bundling for the sake of bundling.** Single-tx sends are cheaper and lower-overhead.
- **Trusting `confirmTransaction` on a bundle's sig** as proof it landed via the bundle — that sig could have landed via a separate path. Use the block engine or `/bundle-trace`.
- **Letting bundle latency block UI/event loops.** Send and confirm async; don't await in a render path.
- **Reusing the same tip account across many bundles in the same slot.** Random selection is cheap insurance.

## See also

- [tutorials/48-jito-bundle-strategies.md](../../../tutorials/48-jito-bundle-strategies.md)
- [.claude/agents/jito-bundler.md](../../agents/jito-bundler.md)
- [.claude/commands/bundle-trace.md](../../commands/bundle-trace.md)
- [Jito Labs docs](https://jito-labs.gitbook.io/mev)
