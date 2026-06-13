---
description: Decode and pretty-print a pump.fun bonding-curve account's state (reserves, progress, complete flag, quote mint).
argument-hint: <coin-mint-pubkey-or-curve-pda>
---

Decode a bonding-curve PDA's raw bytes into a human-readable summary. Useful for diagnosing "why won't this coin trade", confirming graduation status, or sanity-checking quote math before a large entry.

## Steps

1. Parse `$ARGUMENTS`. Accept either:
   - A coin mint pubkey (derive the curve PDA via `["bonding-curve", mint]` under `PUMP_PROGRAM_ID`)
   - A curve PDA pubkey directly
2. Resolve the RPC URL via [packages/core/src/solana/rpc.ts](../../packages/core/src/solana/rpc.ts).
3. Fetch the account with `getAccountInfo(pda, 'confirmed')`. If `null`, the curve doesn't exist (coin may not be a pump.fun launch, or the wrong network).
4. Decode using `BondingCurveAccount` from [@nirholas/pump-sdk](https://www.npmjs.com/package/@nirholas/pump-sdk). Don't hand-decode the bytes.
5. Report:
   - **Version**: V1 vs V2 (presence of `quote_mint` field)
   - **Quote mint** (V2 only): WSOL / USDC / other — label by checking [packages/core/src/solana/programs.ts](../../packages/core/src/solana/programs.ts)
   - **Reserves**: virtual SOL/quote, virtual tokens, real SOL/quote, real tokens (with decimals applied)
   - **Spot price**: `virtual_quote / virtual_tokens`, in human units
   - **Total supply** and **graduation progress**: % of supply sold, plus the bps figure
   - **Complete flag**: yes/no, with a follow-up note if `true` but the AMM pool isn't queryable yet
   - **Creator pubkey**
6. If progress is ≥95%, surface a warning that the coin is in the contested-migration window (see [tutorials/50-mev-defense-patterns.md](../../tutorials/50-mev-defense-patterns.md) Defense 6).

## When to use

- Before placing a large buy or sell.
- When debugging a quote that doesn't match the SDK's prediction.
- When investigating a coin that won't trade ("complete" is true, but the bot didn't switch to AMM).
- For research: spot-checking dozens of curves quickly (batch via `getMultipleAccountsInfo`).

## Avoid

- Don't hand-roll the byte layout. The SDK's typed decoder is the source of truth.
- Don't compute prices from *real* reserves. Use virtual reserves for the constant-product math (see [tutorials/51-bonding-curve-internals.md](../../tutorials/51-bonding-curve-internals.md)).
- Don't assume the quote mint without checking — V1 curves are always SOL-quoted, V2 carry an explicit field.
- Don't trust a single fetch as live state for trading decisions — subscribe via `onAccountChange` if you need realtime.
