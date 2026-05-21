---
description: Simulate a transaction against current chain state before broadcasting. Surfaces compute usage, logs, expected events, and likely failures.
argument-hint: <path-to-tx-builder-script> [-- ...args]
---

Use the project's adversarial-simulation pattern from [tutorials/50-mev-defense-patterns.md](../../tutorials/50-mev-defense-patterns.md) (Defense 5) to dry-run a transaction before sending it. Use this for any flow where a wasted on-chain send is expensive: launches, large entries, rescues.

## Steps

1. Parse `$ARGUMENTS`. Expect a path to a TS script that exports `buildTx(connection): Promise<{ tx: Transaction, expectedEvents: string[] }>`. Treat anything after `--` as args to that script.
2. Resolve the RPC URL via [packages/core/src/solana/rpc.ts](../../packages/core/src/solana/rpc.ts) so the simulation matches the same endpoint the real send would use.
3. Run:
   ```bash
   npx tsx <script> --simulate
   ```
   If the script doesn't support `--simulate`, fall back to:
   ```typescript
   const sim = await conn.simulateTransaction(tx, { sigVerify: false, commitment: 'confirmed' });
   ```
4. Report:
   - Top-level `err` (null = clean simulation, otherwise the program error)
   - Compute units consumed vs. the tx's compute-unit limit
   - All program logs, with PumpFun/PumpAMM logs flagged
   - Whether each expected event appears in the logs (presence-only check; field-level decoding is the [decode-event](decode-event.md) command's job)
   - Inner-instruction accounts touched, with the program ID labelled if it's in [packages/core/src/solana/programs.ts](../../packages/core/src/solana/programs.ts)
5. If the simulation succeeds but expected events are missing, flag this as a soft failure — the tx will land but won't do what the caller intended (e.g., a buy event missing because the curve is already complete).

## When to use

- Before sending a launch+buy bundle.
- Before a multi-wallet entry that would burn priority fees on a doomed tx.
- Before any rescue flow where ordering matters.
- When debugging "the tx landed but nothing happened" mysteries.

## Avoid

- Don't simulate against a stale account snapshot. Use `commitment: 'confirmed'` (or `'finalized'` if you can afford the latency).
- Don't trust a clean simulation as proof the *real* send will succeed — sandwich risk and slot-level state changes are not simulated.
- Don't simulate with `sigVerify: true` on unsigned txs. It will reject as malformed.
- Don't paste the full simulation logs into chat unless the user asks; summarise instead and offer the raw output on request.
