---
description: Decode every pump.fun / pump-amm event emitted by a given transaction signature, using typed SDK decoders.
argument-hint: <tx-signature>
---

Pull every PumpFun-related event out of a tx and pretty-print it with typed field names. Use this instead of squinting at raw `Program log:` lines.

## Steps

1. Parse `$ARGUMENTS`. Expect a single base58 transaction signature.
2. Resolve the RPC URL via [packages/core/src/solana/rpc.ts](../../packages/core/src/solana/rpc.ts).
3. Fetch the parsed tx:
   ```typescript
   const tx = await conn.getTransaction(sig, {
     commitment: 'confirmed',
     maxSupportedTransactionVersion: 0,
   });
   ```
4. Iterate the inner instructions and program logs. For each:
   - Identify the program ID (compare against [packages/core/src/solana/programs.ts](../../packages/core/src/solana/programs.ts) — label PumpFun, PumpAMM, PumpFees, system, etc.)
   - Pull the **typed decoders** from [@nirholas/pump-sdk](https://www.npmjs.com/package/@nirholas/pump-sdk) (preferred path — the recent `refactor(channel)` commits moved everything onto these).
   - For each decoded event, print: event name (e.g., `TradeEvent`, `CreateEvent`, `CollectCreatorFeeEvent`, `MigrationEvent`, …), V1 vs V2, and every field with its decoded type.
5. Highlight notable events at the top:
   - **CreateEvent** with the mint, creator, and quote_mint (USDC vs WSOL)
   - **TradeEvent** with direction (buy/sell), quote in/out, tokens in/out, and the post-trade reserves
   - **MigrationEvent** with the AMM pool and the migrated LP amount
   - **CollectCreatorFeeEvent** with creator, recipient ATA, and amount
6. If a log line can't be matched to a typed decoder, fall back to printing the raw `Program log:` line and flag it for follow-up — that's likely a new event the SDK hasn't typed yet.

## When to use

- After a launch or a creator-fee collection, to confirm exactly what happened on chain.
- For incident response: "what did this tx actually do".
- As input for a [bundle-trace](bundle-trace.md) follow-up.
- When testing SDK upgrades: spot-check that new event types are decoded correctly.

## Avoid

- Don't hand-decode `data:` blobs. The SDK owns this; use it. If it doesn't have a decoder, file an SDK issue rather than rolling one in PumpKit.
- Don't conflate V1 and V2 event types. They share names but have different fields. The decoder picks the right one by discriminator.
- Don't drop the `maxSupportedTransactionVersion` — many recent txs are versioned-tx (v0), and the legacy fetch will return null.
- Don't print raw signatures for fee-share recipients in public-facing output without confirming with the user — they may be sensitive in some contexts.
