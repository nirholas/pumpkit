# Tutorial 50 — MEV protection for pump.fun launches and trades

> Audience: trading-bot operators and high-stakes launchers who care about getting front-run, sandwiched, or out-bid on priority fees.
>
> What this is not: a tutorial on how to *do* MEV against others. PumpKit is for defensive/observability use cases; we don't ship MEV-extraction tooling.

## The four MEV problems on pump.fun

1. **Sniping** — a bot sees your launch tx, lands a `buy` in the same block (or the next), captures the cheap early tokens.
2. **Sandwiching** — a bot front-runs your buy with its own buy, then back-runs with a sell, pocketing the slippage you cause.
3. **Priority-fee races** — competing buys/sells with higher priority fees skip ahead of yours.
4. **Mempool surveillance** — a watcher reads your unconfirmed tx and uses the signal to act elsewhere (not necessarily as the same tx).

The first three are the operational risks for most bot operators. The fourth matters for high-value launches.

## Solana's MEV environment is different from Ethereum

A few facts worth knowing:

- Solana has **no public mempool**. RPC nodes forward your tx to the current leader, but other actors can't read it the way they read Ethereum's mempool.
- **Leaders rotate every 4 slots (~1.6s)**. The leader picks the order of txs in their slot — that's where ordering MEV happens.
- **Jito** runs a parallel network: searchers submit bundles, validators run the Jito-Solana client and prefer bundle order. This is where sandwiching commonly happens.
- **Priority fees** are the primary on-chain knob a normal user has to influence ordering inside a slot.

So your defences are different from Ethereum:

- Hiding the tx doesn't really exist (no mempool) — but the leader still sees it before it lands.
- Bundling **defensively** (atomic with a guard) is possible via Jito.
- Priority fees buy ordering within a slot, not exclusive execution.

## Defence 1 — Slippage guards (the #1 defence)

Every V2 buy/sell takes `minTokensOut` / `minQuoteOut`. **Always set these.** A sandwich attack relies on you accepting a worse price than expected.

```typescript
import { buildBuyV2Ix } from '@nirholas/pump-sdk';

const expectedTokens = quoteBuyOutput(curveState, quoteAmount);   // pure math, no RPC
const minTokensOut   = applySlippageBps(expectedTokens, 100);     // 1% slippage tolerance

const ix = await buildBuyV2Ix({
  buyer:        wallet.publicKey,
  mint:         coinMint,
  quoteMint:    USDC_MAINNET,
  quoteAmount:  1_000_000n,
  minTokensOut,
});

function applySlippageBps(amount: bigint, bps: number): bigint {
  return amount * BigInt(10_000 - bps) / 10_000n;
}
```

See [tutorial 51](51-slippage-modeling-v2.md) for the curve math.

**Right slippage:**
- Quiet curves (post-launch sniper window passed): 1–2%
- Active curves (mid-volatility): 3–5%
- Launch moment, sniping new coin: 10–20% — but accept that you'll occasionally take a bad fill

**Too-loose slippage is the most common reason bots get rekt by sandwichers.**

## Defence 2 — Priority fees, but with a brain

Priority fees buy you slot-internal ordering. They do **not** buy you exclusivity.

```typescript
import { ComputeBudgetProgram } from '@solana/web3.js';

const cuLimit = ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 });
const cuPrice = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }); // ~0.0003 SOL on 300k CU
```

Rules of thumb:

- **Don't set a static fee.** Sample the recent prioritization fees and pay the 75th percentile.
- **Don't pay 10x the network.** You'll waste money — the leader sorts by fee, not by exponent.
- **Bump on retry**, not on every tx.

Sampling prioritization fees:

```typescript
const fees = await connection.getRecentPrioritizationFees({ lockedWritableAccounts: [coinMint] });
const sorted = fees.map(f => f.prioritizationFee).sort((a, b) => a - b);
const p75 = sorted[Math.floor(sorted.length * 0.75)] ?? 50_000;
```

## Defence 3 — Jito bundles for atomic execute-or-revert

For high-value entries, use a Jito bundle to atomically pair your buy with a guard tx that asserts a post-condition.

Conceptually:

```text
Bundle:
  [tx 1] your buy with strict minTokensOut
  [tx 2] assert post-condition (e.g., balance == expected)
```

If anyone front-runs you and your `minTokensOut` is too aggressive, your buy reverts, the assert reverts, the whole bundle is dropped — you don't pay slippage to the attacker.

There are two ways to use Jito:

1. **Direct submission to a Jito block-engine endpoint** — requires running a `jito-rpc` URL or using a managed provider.
2. **A relay (e.g., Jito's public endpoint)** — same idea, but you pay a tip to the searcher pool.

```typescript
// pseudo-code; see Jito docs for current SDK
import { SearcherClient } from 'jito-ts';

const searcher = new SearcherClient(process.env.JITO_BLOCK_ENGINE_URL!);

const bundle = await searcher.sendBundle([
  buyTx.signature,
  // optional tip tx — Jito requires a tip in lamports to be considered
  tipTx.signature,
]);
```

**Caveats:**
- Jito bundles add ~200–500ms latency vs. direct send.
- A tip is required (typically 5_000–100_000 lamports).
- Bundles can still fail — not all blocks are produced by Jito-enabled validators.

## Defence 4 — Don't broadcast launch txs ahead of time

If you're launching with significant capital pre-loaded into the deployer, **don't sign the create tx before you're ready to send**. A stolen unsigned tx is harmless; a stolen signed serialized tx can be replayed by anyone who finds it.

Practical:
- Sign and broadcast in the same process call.
- Don't write serialized signed txs to disk / logs / Telegram.
- If you must persist a tx (e.g., for retry), encrypt and isolate it.

## Defence 5 — Reduce launch-time predictability

Sniper bots watch for:

- Known deployer wallets (they pre-blocklist your address)
- "Pump"-suffixed mints in `getSignaturesForAddress` of token program (they catch in flight)
- Social posts that announce a launch time

You can't hide a launch tx, but you can reduce the **value of advance knowledge**:

- Use a fresh deployer each launch.
- Don't pre-fund the deployer hours in advance (it's a tell).
- Don't pre-grind the mint and then sit on it for days.
- Stagger your buys post-launch instead of one huge buy that gets sandwiched.

## Defence 6 — Health checks before broadcast

A bot that retries blindly hands free money to attackers. Pre-broadcast checks:

```typescript
// 1. Sanity: do we have enough USDC + SOL?
const usdcBal = await connection.getTokenAccountBalance(usdcAta);
if (BigInt(usdcBal.value.amount) < tradeAmount) throw new Error('insufficient USDC');

// 2. Curve sanity: did the curve graduate / get paused?
const curve = await fetchCurveState(connection, coinMint);
if (curve.paused || curve.graduated) throw new Error('curve unavailable');

// 3. Fresh blockhash
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
tx.recentBlockhash = blockhash;

// 4. Simulate
const sim = await connection.simulateTransaction(tx, [wallet]);
if (sim.value.err) throw new Error(`simulation: ${JSON.stringify(sim.value.err)}`);
```

If simulation fails, **don't blindly retry with bumped priority fee**. The fee won't fix a curve constraint.

## Detection (for monitoring, not retaliation)

If you're operating an observability platform, you may want to detect sandwich attacks on your users:

```sql
-- Pseudo-SQL on a pump_trades table
WITH user_buys AS (
  SELECT signature, slot, mint, user_pubkey, quote_amount, token_amount, block_time
  FROM pump_trades
  WHERE side = 'buy' AND user_pubkey = $1
)
SELECT
  ub.signature AS user_buy_sig,
  before.signature AS front_run_sig,
  after.signature  AS back_run_sig
FROM user_buys ub
JOIN pump_trades before
  ON before.mint = ub.mint
 AND before.slot = ub.slot
 AND before.side = 'buy'
 AND before.user_pubkey != ub.user_pubkey
 AND before.block_time < ub.block_time
JOIN pump_trades after
  ON after.mint = ub.mint
 AND after.slot = ub.slot
 AND after.user_pubkey = before.user_pubkey
 AND after.side = 'sell'
 AND after.block_time > ub.block_time;
```

Same slot, opposite-direction by the same wallet, bracketing your buy — classic sandwich pattern.

## Common mistakes

- **No slippage guard at all.** `minTokensOut: 0n` is an invitation to be sandwiched for everything except dust.
- **Slippage too tight on launch buys.** You'll constantly revert and not enter. 10–20% bps is reasonable for the first few seconds of a coin.
- **Static priority fees.** You'll lose races during volatility and overpay during calm.
- **Priority fees on simulation-failing txs.** A bad payload won't land at any priority fee.
- **Trusting public RPC during volatility.** The same RPC that the front-runners use is not the one you want.
- **Pre-signing launch txs.** Stolen signed txs can be replayed.

## See also

- [tutorials/51-slippage-modeling-v2.md](51-slippage-modeling-v2.md) — slippage math underpins all of this
- [tutorials/48-usdc-trading-bot.md](48-usdc-trading-bot.md) — a bot that uses these defences
- [tutorials/49-indexing-v2-events.md](49-indexing-v2-events.md) — Geyser if you need < 500ms latency
- [docs/rpc-best-practices.md](../docs/rpc-best-practices.md) — RPC tuning
- [tools/check-pump-funding.ts](../tools/check-pump-funding.ts) — flag pump-seeded wallets
