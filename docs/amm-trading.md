# AMM Trading Guide

Buy, sell, deposit, and withdraw on graduated PumpAMM pools.

> **Program:** PumpAMM (`pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA`)

---

## Overview

When a token's bonding curve reaches 100% and graduates, it migrates to the PumpAMM — a constant-product AMM pool. The SDK provides full instruction builders for trading and liquidity management on these pools.

### Bonding Curve vs AMM

| Phase | Program | Price Model | Liquidity |
|-------|---------|-------------|-----------|
| Pre-graduation | Pump | Bonding curve (virtual reserves) | Single-sided (SOL only) |
| Post-graduation | PumpAMM | Constant product (x·y=k) | Two-sided (SOL + token) |

Check graduation status:

```typescript
const bondingCurve = await onlineSdk.fetchBondingCurve(mint);
if (bondingCurve.complete) {
  // Token has graduated — use AMM methods
}
```

---

## Trading

### Buy (Specify Token Output)

Buy a specific amount of tokens, with a maximum SOL you're willing to spend.

```typescript
import { PUMP_SDK } from "@nirholas/pump-sdk";
import BN from "bn.js";

const ix = await PUMP_SDK.ammBuyInstruction({
  user: walletPublicKey,
  pool: poolAddress,           // Pool PDA for this token
  mint: tokenMint,
  baseAmountOut: new BN(1_000_000),    // Tokens to receive
  maxQuoteAmountIn: new BN(100_000),   // Max SOL (lamports) to spend
  cashback: false,                      // Optional: earn cashback
});
```

### Buy (Specify SOL Input)

Spend an exact amount of SOL, with a minimum token output.

```typescript
const ix = await PUMP_SDK.ammBuyExactQuoteInInstruction({
  user: walletPublicKey,
  pool: poolAddress,
  mint: tokenMint,
  quoteAmountIn: new BN(100_000),       // Exact SOL (lamports) to spend
  minBaseAmountOut: new BN(900_000),    // Minimum tokens to receive
  cashback: false,
});
```

### Sell

Sell tokens for SOL with a minimum output guarantee.

```typescript
const ix = await PUMP_SDK.ammSellInstruction({
  user: walletPublicKey,
  pool: poolAddress,
  mint: tokenMint,
  baseAmountIn: new BN(1_000_000),      // Tokens to sell
  minQuoteAmountOut: new BN(90_000),    // Minimum SOL (lamports) to receive
  cashback: false,
});
```

### v2 trades (October 2026 upgrade)

PumpSwap added `buy_v2`, `sell_v2` and `buy_exact_quote_in_v2`. They take the same arguments and the same quote math as v1, but keep the protocol and creator fee in the pool's quote vault (`Pool.protocol_fees`, `Pool.creator_fees`) for a later sweep instead of transferring them on every trade. The buyback part of the protocol fee and the LP fee are unchanged.

- Build them with `@pump-fun/pump-swap-sdk` 2.1.0: `buyV2Instructions`, `buyExactQuoteInV2Instructions`, `sellV2Instructions`, or pass `{ v2: true }` to `buyBaseInput` / `buyQuoteInput` / `sellBaseInput` / `sellQuoteInput`, which use v2 wherever `supportsTradeV2(pool)` is true.
- Cashback pools refuse v2 (`CashbackCoinNotSupported`, 6079). Keep v1 for them. Mayhem pools work with v2 (`supportsTradeV2(pool)` in `@pump-fun/pump-swap-sdk` 2.1.0 is `!pool.isCashbackCoin`); the upstream docs list `MayhemPoolNotSupported` (6080) for a multi-hop swap routed through a mayhem pool.
- To route through several pools and curves in one instruction, use `multi_hop_swap`. See [tutorial 55](../tutorials/55-october-2026-trade-upgrade.md#5-multi-hop-swaps).

### Signed `virtual_quote_reserves`

`Pool.virtual_quote_reserves` is an **`i128`** at byte offset 245, and v2 trades push it below zero by the fees they keep, so kept fees never count as liquidity. Price every pool with:

```text
effective_quote_reserves = pool_quote_token_account.amount + virtual_quote_reserves
```

Read it as a signed integer; an unsigned read turns a small negative number into an enormous price. Older pools that predate the field are shorter and read it as `0`. `decodePumpPool` and `effectivePoolQuoteReserves` from `@pumpkit/core` do both. Payouts are capped by the real vault (`InsufficientRealQuoteReserves`, 6063). Upstream: [NEGATIVE_VIRTUAL_QUOTE_RESERVES.md](https://github.com/pump-fun/pump-public-docs/blob/main/docs/NEGATIVE_VIRTUAL_QUOTE_RESERVES.md).

---

## Liquidity Provision

> A pool that has not traded since the upgrade has the older, shorter account layout. Call the permissionless `extend_account` on it before `deposit` or `withdraw`.

### Deposit (Add Liquidity)

Provide both tokens and SOL to earn LP tokens.

```typescript
const ix = await PUMP_SDK.ammDepositInstruction({
  user: walletPublicKey,
  pool: poolAddress,
  mint: tokenMint,
  maxBaseAmountIn: new BN(1_000_000),    // Max tokens to deposit
  maxQuoteAmountIn: new BN(100_000),     // Max SOL to deposit
  minLpTokenAmountOut: new BN(50_000),   // Minimum LP tokens to receive
});
```

### Withdraw (Remove Liquidity)

Burn LP tokens to receive tokens and SOL back.

```typescript
const ix = await PUMP_SDK.ammWithdrawInstruction({
  user: walletPublicKey,
  pool: poolAddress,
  mint: tokenMint,
  lpTokenAmountIn: new BN(50_000),       // LP tokens to burn
  minBaseAmountOut: new BN(900_000),     // Minimum tokens to receive
  minQuoteAmountOut: new BN(80_000),     // Minimum SOL to receive
});
```

---

## Creator Fee Management

### Collect Creator Fees

Token creators collect accumulated trading fees from the AMM pool.

```typescript
const ix = await PUMP_SDK.ammCollectCoinCreatorFeeInstruction({
  creator: creatorWallet,
});
```

Fees from v2 trades wait in `Pool.creator_fees` until PumpSwap `sweep_creator_fee` moves them into the coin creator vault. Put the sweep first in the same transaction: `getCreatorFeeSweepInstructions(connection, mint, payer)` from `@pumpkit/core` returns it (and the curve sweep) only when something waits. The same sweep must come before `transfer_creator_fees_to_pump`, CTO or a creator change, which otherwise fail with `CreatorFeesNotSwept` (6081). See [tutorial 47](../tutorials/47-v2-creator-fees.md).

### Transfer Creator Fees to Pump

Move creator fees from the AMM pool back to the Pump program for distribution.

```typescript
const ix = await PUMP_SDK.ammTransferCreatorFeesToPumpInstruction({
  coinCreator: creatorWallet,
});
```

### Set Coin Creator

Set the creator for an AMM pool based on bonding curve metadata.

```typescript
const ix = await PUMP_SDK.ammSetCoinCreatorInstruction({
  pool: poolAddress,
  mint: tokenMint,
});
```

### Migrate Pool Coin Creator

Update the pool's creator based on the fee sharing config.

```typescript
const ix = await PUMP_SDK.ammMigratePoolCoinCreatorInstruction({
  pool: poolAddress,
  mint: tokenMint,
});
```

---

## Volume Tracking

### Sync User Volume Accumulator

Sync a user's volume tracking data between the Pump and PumpAMM programs.

```typescript
const ix = await PUMP_SDK.ammSyncUserVolumeAccumulatorInstruction(userPublicKey);
```

### Claim AMM Cashback

Claim cashback earned from AMM trading volume.

```typescript
const ix = await PUMP_SDK.ammClaimCashbackInstruction({
  user: walletPublicKey,
});
```

---

## AMM Events

All AMM events can be decoded from transaction logs:

```typescript
const buyEvent = PUMP_SDK.decodeAmmBuyEvent(eventData);
const sellEvent = PUMP_SDK.decodeAmmSellEvent(eventData);
const depositEvent = PUMP_SDK.decodeDepositEvent(eventData);
const withdrawEvent = PUMP_SDK.decodeWithdrawEvent(eventData);
const createPoolEvent = PUMP_SDK.decodeCreatePoolEvent(eventData);
```

### AmmBuyEvent Fields

| Field | Type | Description |
|-------|------|-------------|
| `baseAmountOut` | `BN` | Tokens received |
| `quoteAmountIn` | `BN` | SOL spent (before fees) |
| `userQuoteAmountIn` | `BN` | SOL spent (after fees) |
| `lpFee` | `BN` | Fee to LP providers |
| `protocolFee` | `BN` | Fee to protocol |
| `coinCreatorFee` | `BN` | Fee to token creator |
| `cashback` | `BN` | Cashback earned |
| `pool` | `PublicKey` | Pool address |
| `user` | `PublicKey` | Buyer address |
| `buybackFee` | `BN` | Buyback part of the protocol fee |
| `virtualQuoteReserves` | `i128` | Signed virtual quote reserves after the trade |
| `creatorFeeUnclaimed` | `BN` | Creator fee waiting in the pool after the trade |

### AmmSellEvent Fields

| Field | Type | Description |
|-------|------|-------------|
| `baseAmountIn` | `BN` | Tokens sold |
| `quoteAmountOut` | `BN` | SOL received (before fees) |
| `userQuoteAmountOut` | `BN` | SOL received (after fees) |
| `lpFee` | `BN` | Fee to LP providers |
| `protocolFee` | `BN` | Fee to protocol |
| `coinCreatorFee` | `BN` | Fee to token creator |
| `cashback` | `BN` | Cashback earned |
| `buybackFee` | `BN` | Buyback part of the protocol fee |
| `virtualQuoteReserves` | `i128` | Signed virtual quote reserves after the trade |
| `creatorFeeUnclaimed` | `BN` | Creator fee waiting in the pool after the trade |

The full list, including `canBoost`, `baseSupply` and holder rewards, is in the [Events Reference](./events-reference.md#ammbuyevent). Fee sweeps emit `SweepPoolFeeEvent`.

---

## Finding Pool Addresses

Use the `OnlinePumpSdk` to look up pool addresses:

```typescript
import { OnlinePumpSdk } from "@nirholas/pump-sdk";

const onlineSdk = new OnlinePumpSdk(connection);
const pool = await onlineSdk.fetchPool(mint);
```

Or derive the pool PDA:

```typescript
import { poolPda } from "@nirholas/pump-sdk";

const [poolAddress] = poolPda(mint);
```

---

## Slippage Protection

All AMM methods include slippage parameters:

- **Buy:** `maxQuoteAmountIn` caps the SOL spent
- **Buy exact:** `minBaseAmountOut` guarantees minimum tokens
- **Sell:** `minQuoteAmountOut` guarantees minimum SOL
- **Deposit:** `minLpTokenAmountOut` guarantees minimum LP tokens
- **Withdraw:** `minBaseAmountOut` + `minQuoteAmountOut` guarantee minimums

Set these based on your slippage tolerance. For a 1% slippage:

```typescript
const slippageBps = 100; // 1%
const minOutput = expectedOutput.mul(new BN(10000 - slippageBps)).div(new BN(10000));
```

---

## Related

- [Bonding Curve Math](./guides/bonding-curve-math.md) — Pre-graduation pricing
- [Fee Tiers](./fee-tiers.md) — Fee structure across tiers
- [Cashback](./cashback.md) — Cashback system
- [Events Reference](./events-reference.md) — Complete event catalog
- [Tutorial 34](../tutorials/34-amm-liquidity-operations.md) — Step-by-step AMM guide
