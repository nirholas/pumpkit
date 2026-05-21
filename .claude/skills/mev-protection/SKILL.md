---
name: mev-protection
description: Use this skill any time MEV exposure is a consideration in PumpKit — designing or auditing a trading flow, deciding slippage / RPC privacy / wallet rotation, hardening a launch, or post-mortem investigating a sandwich. Triggers on "MEV", "sandwich", "frontrun", "sniper", "copy-trader", "private RPC", "wallet rotation", "slippage", "contested launch". Skip for read-only flows (analytics, decoders) where no value is at risk.
---

# MEV protection for PumpKit

This skill is the project-specific defense playbook. Companion: [tutorials/50-mev-defense-patterns.md](../../../tutorials/50-mev-defense-patterns.md).

## Mental model

Solana has **no global mempool**, so classical Ethereum-style frontrunning doesn't apply. The real threats are:

| Adversary | What they see | What they extract |
|---|---|---|
| Searcher with leader access | Submitted tx at slot boundary | Sandwich profit |
| Sniper bot watching logs | Your `create` instruction | Co-block entry via Jito bundle |
| RPC operator | Every preflight + send | Copy-trade or front-of-line |
| Copy-trader | All your historical on-chain activity | Replay your strategy with lag |
| Migration sniper | Curves near graduation | LP entry on the post-migration AMM |

You can't eliminate any of these — only raise their cost above their profit.

## The defense matrix

| Defense | Cost | Stops | Doesn't stop |
|---|---|---|---|
| **Jito bundle for launch+buy** | 0.005–0.05 SOL tip | Co-block snipers, intra-bundle sandwiches | Post-landing copy-traders |
| **Private-send RPC / direct block engine** | RPC subscription / Jito routing | Pre-land observation by RPC operators | On-chain visibility after landing |
| **Wallet rotation** | Vanity grinding + funding overhead | Copy-traders watching your wallet | Leaked deployer keypair |
| **Tight slippage + chunking** | Reverts on price moves, extra priority fees | Sandwiches with thin profit margins | Slow sandwiches with deep pockets |
| **Adversarial simulation** | One extra RPC call | Doomed sends, stale-state errors | Sandwiches that happen mid-flight |
| **Migration-window awareness** | Foregone late entries | Last-slot LP sniping losses | Pre-graduation accumulation losses |
| **Operational hygiene** | Process discipline | Keypair leaks, env-var leaks, log scraping | On-chain analysis |

## Slippage policy

```typescript
const SLIPPAGE_BPS = {
  contested:    100,   // 1%  — launches, hot coins, MEV environments
  default:      500,   // 5%  — most quiet trades
  illiquid:    2000,   // 20% — tiny coins, pre-graduation thin curves
} as const;

function maxQuoteIn(targetCost: bigint, regime: keyof typeof SLIPPAGE_BPS): bigint {
  const bps = BigInt(SLIPPAGE_BPS[regime]);
  return (targetCost * (10_000n + bps)) / 10_000n;
}
```

Rules:

- **Never use unbounded slippage.** If a caller doesn't specify, reject the call. (`Number.MAX_SAFE_INTEGER` is not a slippage policy.)
- **Always pair tight slippage with a retry path.** Otherwise users disable slippage when it reverts too often.
- **Chunk into N sub-buys for large entries.** Each chunk has its own slippage check.

## Wallet rotation

The shape of a defensible rotation:

1. **Pre-grind a pool of deployer keypairs.** Vanity grinding is slow; don't do it during a launch. Keep ~10 ready in `tmp/` (gitignored).
2. **Seed each from independent funding sources.** Direct transfer from your main wallet defeats the rotation — chain analysis links them.
3. **Verify funding upstream**: run `npx tsx tools/check-pump-funding.ts <pubkey>` before launch. A deployer flagged as pump-seeded is itself a signal.
4. **Single-use per launch.** Never reuse a deployer for a second launch.
5. **Keep keypair files mode 600** and never `git add` them. `bash tools/check-file-permissions.sh` enforces this; run it in CI.

## RPC privacy

| Channel | Privacy guarantee | Use for |
|---|---|---|
| Public free RPC | None | Never use for prod sends |
| Vanilla paid RPC | Vendor-dependent (read T&Cs) | Reads, low-value sends |
| Privacy-focused RPC | Explicit, contractual | High-value sends, contested launches |
| Jito block engine direct | Bundle contents not surfaced pre-land | Bundles only (which most contested sends should be anyway) |

Privacy is a head-start, not invisibility. Once the tx lands, it's permanent and public.

## Adversarial simulation

Before any high-value send:

```typescript
const sim = await conn.simulateTransaction(tx, { sigVerify: false, commitment: 'confirmed' });
if (sim.value.err) throw new Error(`Sim failed: ${JSON.stringify(sim.value.err)}`);

const logs = sim.value.logs ?? [];
const expectedEvents = ['Buy event', 'TradeEvent'];
const missing = expectedEvents.filter(e => !logs.some(l => l.includes(e)));
if (missing.length) {
  throw new Error(`Expected events not in sim logs: ${missing.join(', ')}`);
}
```

What this catches: stale state, wrong quote mint (USDC vs WSOL on V2), curve already complete. What it doesn't: sandwiches that haven't happened yet.

Use [.claude/commands/simulate-tx.md](../../commands/simulate-tx.md) for the canonical pattern.

## Migration-window protocol

Alarms at curve progress thresholds:

| Progress | Action |
|---|---|
| 50% | Note in dashboard, no action |
| 80% | Pre-arm migration handler |
| 90% | Tighten slippage; stop new accumulation unless intentional |
| 95% | Don't enter unless you have MEV infra. Watch for migration tx. |
| 99% | Migration imminent — switch routing logic to AMM the moment `complete` flips |

See [.claude/agents/migration-detector.md](../../agents/migration-detector.md) for monitor wiring.

## Operational hygiene checklist

Run through this before any production deployment:

- [ ] Keypair files are mode 600. (`bash tools/check-file-permissions.sh`)
- [ ] `.gitignore` covers `*.env`, `*keypair*.json`, `tmp/leaked-launch/`.
- [ ] Bot tokens are read from env, never committed.
- [ ] Logs redact bot tokens, full signatures (if PII-adjacent), and RPC URLs containing secrets.
- [ ] CI secrets are masked in build output.
- [ ] No remote signer service. Sign locally.
- [ ] If you ship a Docker image, secrets are in env / mounted files, not in the layer.

## A defended launch, end to end

```
Plan
────
- Coin: USDC-paired, V2
- Entry: 3 wallets, 1.0 USDC each, atomic
- Tip budget: 0.02 SOL (contested-launch urgency)
- Wallets: pre-grinded, seeded from independent sources, never used before

Pre-flight
──────────
[ ] tools/check-file-permissions.sh         passes
[ ] tools/check-pump-funding.ts <deployer>  not seeded by pump
[ ] tools/check-pump-funding.ts <walletA-C> not seeded by pump
[ ] All four keypairs verified as the intended pubkeys
[ ] Mint vanity matches the program's required suffix

Bundle
──────
tx[0] create_v2(deployer, mintKp, USDC_MINT)
tx[1] buy_v2(walletA, mintKp.publicKey, 1.0 USDC, slippage 1%)
tx[2] buy_v2(walletB, mintKp.publicKey, 1.0 USDC, slippage 1%)
tx[3] buy_v2(walletC, mintKp.publicKey, 1.0 USDC, slippage 1%)
tx[4] (auto-appended) tip 0.02 SOL

Send
────
- Endpoint: Jito mainnet block engine (NOT a public RPC)
- Confirm via getSignatureStatuses + /bundle-trace cross-check

Post
────
- For the first 30s: monitor curve state, watch for sandwich patterns
- After 30s: sniper window has mostly closed; resume normal trading rules
```

## See also

- [tutorials/50-mev-defense-patterns.md](../../../tutorials/50-mev-defense-patterns.md)
- [tutorials/48-jito-bundle-strategies.md](../../../tutorials/48-jito-bundle-strategies.md)
- [tutorials/37-security-auditing-verification.md](../../../tutorials/37-security-auditing-verification.md)
- [.claude/agents/mev-defender.md](../../agents/mev-defender.md)
- [.claude/skills/jito-bundles/SKILL.md](../jito-bundles/SKILL.md)
