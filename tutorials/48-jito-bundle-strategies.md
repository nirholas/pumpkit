# Tutorial 48 — Jito bundle strategies: tips, atomicity, and landing odds

> Audience: bot operators who already send transactions one-by-one and want atomic multi-tx execution via Jito bundles. Assumes you've read [tutorial 11](11-trading-bot.md) and have a working RPC.
>
> Companion skill: [.claude/skills/jito-bundles/SKILL.md](../.claude/skills/jito-bundles/SKILL.md)
>
> Companion agent: [.claude/agents/jito-bundler.md](../.claude/agents/jito-bundler.md)

A Jito bundle is an ordered set of up to **5 transactions** that either all land in the same slot or none of them land. That all-or-nothing property is the whole point: it gives you atomicity *across* transactions, not just within one. PumpKit uses bundles for launch+buy, multi-wallet entries, and rescue/extract flows where partial execution would be worse than failure.

## When a bundle is worth it

| Scenario | Use a bundle? | Why |
|---|---|---|
| Launch a coin + immediately buy from the deployer | **Yes** | Frontrunners observe `create` and race the first buy. Atomic = no race. |
| Multi-wallet first-buy across N keypairs | **Yes** | Want all of them in or none — partial entry skews cost basis. |
| One-off buy from a single wallet | No | A normal tx with priority fee is fine and ~10× cheaper. |
| Sell a position when graduation is imminent | **Sometimes** | Bundle if you're competing with snipers for the last block before migration. |
| Rescue tokens from a leaked keypair | **Yes** | Drain + transfer must land atomically before the leaker can act. |

## Anatomy of a bundle

```
┌─────────────────────────────────────────────┐
│ tx[0]  Create coin (mint = vanity keypair)  │  ← signed by deployer
│ tx[1]  Buy from wallet A (0.5 SOL)          │  ← signed by A
│ tx[2]  Buy from wallet B (0.5 SOL)          │  ← signed by B
│ tx[3]  Buy from wallet C (0.5 SOL)          │  ← signed by C
│ tx[4]  Tip transfer to a Jito tip account   │  ← signed by deployer
└─────────────────────────────────────────────┘
```

Rules to internalise:

- **5 tx max** per bundle. Plan splits before you start signing.
- **One tip tx per bundle**, paid in lamports to one of the [8 published Jito tip accounts](https://jito-labs.gitbook.io/mev/mev-payment-and-distribution/on-chain-addresses). Tip goes in the *same bundle*, not a sibling tx.
- **Order is preserved.** If tx[1] depends on tx[0]'s side effects (a created mint), put it after.
- **All txs share a slot.** They are committed atomically; partial state never appears on chain.
- **Reverts kill the bundle.** If any tx reverts, the entire bundle is dropped — including the tip.

## Picking a tip

Tip is *the* knob for landing odds. It is paid only if the bundle lands, but it competes with every other bundle targeting the same slot. As of 2026, useful reference points:

| Landing target | Typical tip (SOL) | When to use |
|---|---|---|
| Background (best-effort) | 0.0001 – 0.0005 | Non-urgent rebalances, off-peak periods |
| Normal sniper | 0.001 – 0.005 | First-buy on a quiet launch |
| Contested launch | 0.01 – 0.05 | Known hyped launch, multiple snipers visible in mempool |
| Whale defence | 0.1+ | Rescue flows or competing with a known funded attacker |

A simple adaptive strategy:

```typescript
import { getRecentJitoTipPercentiles } from './tip-stats'; // your helper

async function pickTip(urgency: 'low' | 'med' | 'high'): Promise<number> {
  const p = await getRecentJitoTipPercentiles(); // {p50, p75, p95, p99} in lamports
  const lamports = urgency === 'high' ? p.p95
                 : urgency === 'med'  ? p.p75
                 :                      p.p50;
  // Cap to avoid runaway tips when the network spikes
  return Math.min(lamports, 0.1 * LAMPORTS_PER_SOL);
}
```

The Jito Labs maintains a public tip-floor stream — your bot should poll it (or scrape the websocket) every few seconds during contested windows and back off when traffic dies.

## Building a bundle in TypeScript

```typescript
import {
  Connection, Keypair, Transaction, TransactionInstruction,
  SystemProgram, PublicKey, LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { searcherClient } from 'jito-ts/dist/sdk/block-engine/searcher.js';
import { Bundle } from 'jito-ts/dist/sdk/block-engine/types.js';

const JITO_TIP_ACCOUNTS = [
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  'ADuUkR4vqLUMWXxW9gh6D6L8pivKeVQqoZjfFp9LVD8e',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
];

export async function sendBundle(
  conn: Connection,
  blockEngineUrl: string, // e.g., 'https://mainnet.block-engine.jito.wtf'
  payer: Keypair,
  txs: Transaction[],
  tipLamports: number,
): Promise<string> {
  if (txs.length > 4) throw new Error('Leave room for the tip tx (max 5 incl tip)');

  const tipAccount = new PublicKey(
    JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)],
  );

  const { blockhash } = await conn.getLatestBlockhash('confirmed');

  const tipTx = new Transaction({ recentBlockhash: blockhash, feePayer: payer.publicKey })
    .add(SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey:   tipAccount,
      lamports:   tipLamports,
    }));
  tipTx.sign(payer);

  // All txs need the same recent blockhash, all must be signed already
  for (const tx of txs) {
    if (!tx.recentBlockhash) tx.recentBlockhash = blockhash;
    if (!tx.signatures.length) throw new Error('Caller must sign each tx');
  }

  const client = searcherClient(blockEngineUrl);
  const bundle = new Bundle([...txs, tipTx], 5);
  const bundleId = await client.sendBundle(bundle);

  return bundleId;
}
```

## Confirming a bundle landed

Bundles return a **bundle ID**, not a transaction signature. To confirm:

1. Poll Jito's `getBundleStatuses` endpoint, OR
2. Poll the leader-tx signature of any tx in the bundle via standard RPC — once that tx is finalized, the bundle landed.

```typescript
async function waitForBundle(bundleId: string, sigs: string[], conn: Connection, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const statuses = await conn.getSignatureStatuses(sigs);
    if (statuses.value.every(s => s?.confirmationStatus === 'confirmed' || s?.confirmationStatus === 'finalized')) {
      return { landed: true, sigs };
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return { landed: false, sigs };
}
```

Worth knowing: bundles that *don't* land never surface as failed txs — they just silently drop. Your bot must time out and decide whether to retry (probably with a higher tip).

## Common pitfalls

- **Forgetting the tip is in the bundle.** People sometimes send the tip as a separate tx — that defeats the entire mechanism. The tip must be inside the same bundle, paid only on success.
- **Stale blockhashes.** All txs must use the *same* recent blockhash and be signed close to send time. >60s old and the leader will drop them.
- **Tip too low for the slot.** No status, no error — just silent drop. Always have a retry-with-higher-tip path.
- **Exceeding 5 txs.** Split into multiple bundles, but lose atomicity across the split.
- **Including a tx that compute-budget-exceeds.** Bundles inherit per-tx CU limits; one fat tx can starve the others. Set explicit `setComputeUnitLimit` per tx.
- **Trying to bundle across programs that revert independently.** Anchor errors in one tx can take the whole bundle down — design every tx to succeed independently *given the prior txs succeeded*.
- **Using mainnet tip accounts on devnet.** Devnet has its own Jito infra; the addresses differ. Confirm via the Jito docs before testing.

## Cost model

Per landed bundle:

```
cost  ≈  Σ(tx_priority_fees) + tip
revenue ≈ entry_pnl
break-even tip = entry_pnl - Σ(priority_fees) - acceptable_risk_margin
```

If you're regularly losing money on bundles that *do* land, your tip is too high for your edge. If you're losing money on bundles that *don't* land, your tip is too low and the priority fees are wasted (priority fees still cost on chain, even when the bundle drops — wait, actually, no: priority fees are only charged on landed txs. The unlanded bundle costs you nothing except opportunity cost. Verify this against the current spec, since the runtime semantics have shifted before).

## See also

- [Jito Labs docs](https://jito-labs.gitbook.io/mev) — authoritative reference
- [tutorials/11-trading-bot.md](11-trading-bot.md) — single-tx trading patterns
- [tutorials/23-mayhem-mode-trading.md](23-mayhem-mode-trading.md) — high-throughput trading
- [tutorials/50-mev-defense-patterns.md](50-mev-defense-patterns.md) — defending against attackers using these same primitives
- [.claude/skills/jito-bundles/SKILL.md](../.claude/skills/jito-bundles/SKILL.md) — comprehensive bundle skill
- [packages/core/src/solana/programs.ts](../packages/core/src/solana/programs.ts) — program IDs used in bundles
