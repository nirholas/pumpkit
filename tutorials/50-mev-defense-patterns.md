# Tutorial 50 — MEV defense patterns for pump.fun bots

> Audience: bot operators whose strategies are being sandwiched, frontrun, or copied. Assumes familiarity with [tutorial 48](48-jito-bundle-strategies.md) (Jito bundles) and [tutorial 11](11-trading-bot.md) (trading bot patterns).
>
> Companion skill: [.claude/skills/mev-protection/SKILL.md](../.claude/skills/mev-protection/SKILL.md)
>
> Companion agent: [.claude/agents/mev-defender.md](../.claude/agents/mev-defender.md)

MEV on Solana is real but takes a different shape than on Ethereum. Without a mempool you can't watch pending txs the same way, but **leader-level visibility, RPC-level sniffing, and copy-trading** all extract value from naive bots. This tutorial covers the threat model and the practical defenses PumpKit uses or recommends.

## Threat model

| Adversary | What they see | What they do |
|---|---|---|
| **Searcher with leader access** | Submitted tx before it's bundled | Sandwich: pre-buy → your tx → sell |
| **Sniper bot watching logs** | Your `create` instruction landing | Buy in the same slot via Jito bundle (frontrun is impossible, but co-block is) |
| **RPC operator** | Every preflight + send your bot makes | Copy your trade or sell into your liquidity |
| **Copy-trader watching your wallet** | All your historical txs and on-chain balances | Re-execute your trades with N-slot lag |
| **Migration sniper** | Bonding curve nearing graduation threshold | Hammer last-slot buys hoping to capture LP entry |

Note: **classical mempool frontrunning doesn't apply** — Solana has no global mempool. The threats above are different mechanics with similar effects.

## Defense 1: Co-block with a Jito bundle on launch

The single highest-value defense for `create + first_buy` flows. Bundling both into one Jito bundle means:

- No external observer sees `create` *before* your buy.
- The two land in the same slot, atomically.
- Other snipers can land in the same slot but **after** your bundle order — they can't slot in before tx[0].

```typescript
// Pseudocode
const bundle = [
  buildCreateV2Tx(deployer, mintKp, quoteMint),
  buildBuyV2Tx(deployer, mint, 0.5 * LAMPORTS_PER_SOL),
  buildBuyV2Tx(walletB, mint, 0.5 * LAMPORTS_PER_SOL),
  // tip tx appended by sendBundle()
];
await sendBundle(conn, blockEngineUrl, deployer, bundle, pickTip('high'));
```

This is the foundation. Everything below builds on it.

## Defense 2: Private mempool / private RPC for sends

Most large Solana RPCs operate on a pass-through model where your `sendTransaction` is observable to anyone watching that vendor's logs (or, in some cases, anyone with paid access to it). Mitigations:

- **Use a sender RPC with a privacy guarantee** (some premium providers offer this) for high-value txs.
- **Send via Jito's block engine directly** rather than through a public RPC. Block engines do not surface in-flight bundle contents until they land.
- **Sign locally, never send through a third-party signer.** No remote signers for prod.

What this *doesn't* protect against: the eventual on-chain visibility. Once your tx lands, it's permanent and public. Privacy is a head-start, not invisibility.

## Defense 3: Decoy wallets and rotation

Copy-traders watch wallet activity, not txs. Counter:

- **Rotate wallets per launch.** A throwaway deployer signs `create`. A second, never-before-seen wallet does the first buy. Funds come via the project's seeding pattern, not direct transfer from a known wallet.
- **Check funding upstream**: `bash tools/audit-dependencies.sh` and `npx tsx tools/check-pump-funding.ts <pubkey>` to confirm a deployer isn't already flagged as pump-seeded (which is itself a public signal).
- **Decoy txs** — send small, low-value txs from your "main" wallet that look like real trades but aren't. Burns a tiny amount of SOL to dilute copy-trader signal.

The rotation cost in vanity-grinding compute is significant (see [tutorial 13](13-vanity-addresses.md)). Pre-grind a pool of deployer keypairs ahead of time so launches don't block on grinding.

## Defense 4: Anti-sandwich slippage and chunking

When buying into a coin that already has volume, set tight slippage. Sandwiches require the attacker to push the price up before your tx — if your `max_quote_in` is too high, you eat the entire sandwich profit yourself.

```typescript
// Bad: sloppy slippage invites sandwiches
buildBuyV2Tx({ mint, amountOut: targetTokens, maxQuoteIn: targetCost * 1.5 });

// Good: tight slippage, accept revert if conditions changed
buildBuyV2Tx({ mint, amountOut: targetTokens, maxQuoteIn: targetCost * 1.02 });
```

For large entries, **chunk into smaller buys spread across slots**. Each chunk gets its own slippage check and reverts cleanly if the price moved past your tolerance. You pay a few extra priority fees but eliminate the worst sandwich scenarios.

```typescript
async function chunkedBuy(target: number, chunks = 5, slippageBps = 200) {
  const per = target / chunks;
  for (let i = 0; i < chunks; i++) {
    const quote = await quoteOnlinePrice(mint);
    const maxIn = (per * (10_000 + slippageBps)) / 10_000;
    try {
      await sendBuy({ amountOut: per, maxQuoteIn: maxIn });
    } catch {
      // Price moved — back off
      await sleep(2_000);
      i--; // retry this chunk
    }
  }
}
```

## Defense 5: Adversarial simulation before sending

Before submitting a high-value tx, simulate it against the *current* state and check for unexpected effects. This won't stop a sandwich (which happens after you sign) but it catches:

- Mint state that changed since you decided to buy (e.g., already graduated)
- Curve drained by a faster bot before your turn
- Wrong quote mint (USDC vs WSOL) in V2 contexts

```typescript
const sim = await conn.simulateTransaction(tx, { sigVerify: false, commitment: 'confirmed' });
if (sim.value.err) throw new Error(`Sim failed: ${JSON.stringify(sim.value.err)}`);

// Inspect inner logs for the expected events
const logs = sim.value.logs ?? [];
if (!logs.some(l => l.includes('Buy event'))) {
  throw new Error('Buy event not emitted — state likely changed');
}
```

The project has a generic helper for this; see [.claude/commands/simulate-tx.md](../.claude/commands/simulate-tx.md).

## Defense 6: Migration-window awareness

When a coin approaches the graduation threshold, snipers crowd the last few slots before migration to capture LP entry. Don't try to *be* a migration sniper unless you've done the math; but if you're already holding, defend by:

- **Setting alarms at 90%, 95%, 99% of graduation supply.** Take profits or rebalance before the storm.
- **Avoiding buys in the contested window unless you have explicit MEV infrastructure.** You will lose to faster bots.
- **Watching the migration event** ([tutorial 06](06-migration.md)) and reacting to AMM liquidity, not bonding-curve quotes, after migration.

See [packages/core/src/monitor/](../packages/core/src/monitor/) for the existing migration detector. Use the `migration-detector` agent ([.claude/agents/migration-detector.md](../.claude/agents/migration-detector.md)) to scope new monitor work.

## Defense 7: Operational hygiene

The most overlooked vector:

- **Keypair leakage** — keypairs in chat, in git, in screenshots. Treat any leaked keypair as fully compromised; rotate immediately ([tutorial 37](37-security-auditing-verification.md)).
- **Bot config in public repos** — RPC URLs, tip account choices, slippage parameters. Treat as semi-sensitive.
- **Telegram bot tokens in logs** — these grant full control of the bot. Redact in any log shipping pipeline.
- **CI secrets** — anyone who can read CI logs can read your env vars unless you mask them.

The keypair check helper (`bash tools/check-file-permissions.sh`) enforces mode 600. Run it in CI.

## A worked example: defending a launch

```
Strategy: launch a USDC-paired coin, atomic-buy from 3 wallets, defend
the first 30 seconds against snipers and copy-traders.

1. Pre-grind 4 deployer keypairs (1 used, 3 reserve). Mode 600.
2. Seed deployers from independent funding sources (NOT pump's funding wallet).
3. Build a Jito bundle:
   tx[0]: create_v2 (USDC pair) signed by deployer
   tx[1]: buy_v2 from wallet A (1.0 USDC)
   tx[2]: buy_v2 from wallet B (1.0 USDC)
   tx[3]: buy_v2 from wallet C (1.0 USDC)
   tx[4]: tip 0.02 SOL (high-urgency, contested launch)
4. Submit via Jito block engine, NOT a public RPC.
5. Confirm bundle landed via getSignatureStatuses on tx[0].sig.
6. For seconds 0-30 post-launch: tight slippage (1-2%), chunked buys
   if accumulating more, monitor for sandwich attempts via curve-state polling.
7. After 30s, sniper window has passed for most cases.
```

## What no defense gives you

- **Invisibility after landing.** All txs are public on chain. Copy-traders can replay your strategy with a few slots of lag.
- **Protection from leader-level adversaries.** A leader can theoretically reorder txs within their slot. Mitigation: bundle through Jito (tip-based ordering > leader whim).
- **Free wins.** Every defense costs SOL (tips, priority fees, chunking overhead, wallet rotation). Budget for it.

## See also

- [tutorial 37](37-security-auditing-verification.md) — keypair security model
- [tutorial 48](48-jito-bundle-strategies.md) — Jito bundle mechanics
- [tutorial 49](49-rpc-resilience.md) — RPC topology (private sends)
- [.claude/skills/mev-protection/SKILL.md](../.claude/skills/mev-protection/SKILL.md) — comprehensive MEV defense skill
- [Jito Labs MEV docs](https://jito-labs.gitbook.io/mev)
