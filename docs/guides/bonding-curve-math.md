# Bonding Curve Math

A deep dive into how the Pump protocol calculates token prices using a constant-product bonding curve.

## Overview

The Pump bonding curve uses a **constant-product AMM formula** (similar to Uniswap) to determine token prices. When a token is created, it starts with virtual reserves that define the initial price. As users buy tokens, the price increases along the curve. When the curve is "complete," the token graduates to a full AMM pool.

## Key Concepts

### Virtual vs Real Reserves

The bonding curve tracks two sets of reserves:

| Reserve | Purpose |
|---------|---------|
| `virtualTokenReserves` | Token side of the constant-product formula — includes both real and virtual liquidity |
| `virtualSolReserves` | SOL side of the constant-product formula — includes both real and virtual liquidity |
| `realTokenReserves` | Actual tokens available for purchase — decreases as users buy |
| `realSolReserves` | Actual SOL deposited by buyers — increases as users buy |

The "virtual" reserves are larger than the "real" reserves. This virtual liquidity ensures the price starts at a reasonable level instead of zero.

### Initial State

When a new token is created, its bonding curve is initialized from the `Global` config:

```typescript
import { newBondingCurve } from "@nirholas/pump-sdk";

const curve = newBondingCurve(global);
// {
//   virtualTokenReserves: global.initialVirtualTokenReserves,
//   virtualSolReserves: global.initialVirtualSolReserves,
//   realTokenReserves: global.initialRealTokenReserves,
//   realSolReserves: BN(0),
//   tokenTotalSupply: global.tokenTotalSupply,
//   complete: false,
//   creator: PublicKey.default,
//   isMayhemMode: global.mayhemModeEnabled,
// }
```

### The Constant Product

The core invariant is:

$$k = virtualTokenReserves \times virtualSolReserves$$

This product $k$ stays approximately constant across trades. When a user buys tokens with SOL:
- `virtualSolReserves` increases (more SOL in the pool)
- `virtualTokenReserves` decreases (tokens leave the pool)
- The ratio changes → price goes up

## Buy Math

### How many tokens do I get for X SOL?

The SDK provides `getBuyTokenAmountFromSolAmount`:

```typescript
import { getBuyTokenAmountFromSolAmount } from "@nirholas/pump-sdk";

const tokensOut = getBuyTokenAmountFromSolAmount({
  global,
  feeConfig,
  mintSupply: bondingCurve.tokenTotalSupply, // or null for new tokens
  bondingCurve,                               // or null for new tokens
  amount: solAmount,                          // SOL in lamports
});
```

**Under the hood**, the calculation works in three steps:

1. **Deduct fees** from the input SOL amount:

$$inputAmount = \frac{(solAmount - 1) \times 10000}{(protocolFeeBps + creatorFeeBps) + 10000}$$

2. **Apply constant-product formula**:

$$tokensOut = \frac{inputAmount \times virtualTokenReserves}{virtualSolReserves + inputAmount}$$

3. **Cap at real reserves** — you can never buy more than `realTokenReserves`:

$$result = \min(tokensOut, realTokenReserves)$$

### How much SOL to buy X tokens?

The inverse: `getBuySolAmountFromTokenAmount`:

```typescript
import { getBuySolAmountFromTokenAmount } from "@nirholas/pump-sdk";

const solNeeded = getBuySolAmountFromTokenAmount({
  global,
  feeConfig,
  mintSupply: bondingCurve.tokenTotalSupply,
  bondingCurve,
  amount: tokenAmount,
});
```

**Formula:**

$$solCost = \frac{\min(amount, realTokenReserves) \times virtualSolReserves}{virtualTokenReserves - \min(amount, realTokenReserves)} + 1$$

Then fees are added on top:

$$totalCost = solCost + fees(solCost)$$

## Sell Math

### How much SOL do I get for X tokens?

The SDK provides `getSellSolAmountFromTokenAmount`:

```typescript
import { getSellSolAmountFromTokenAmount } from "@nirholas/pump-sdk";

const solOut = getSellSolAmountFromTokenAmount({
  global,
  feeConfig,
  mintSupply: bondingCurve.tokenTotalSupply,
  bondingCurve,
  amount: tokenAmount,
});
```

**Formula:**

$$solOut_{raw} = \frac{tokenAmount \times virtualSolReserves}{virtualTokenReserves + tokenAmount}$$

Then fees are subtracted:

$$solOut = solOut_{raw} - fees(solOut_{raw})$$

## Market Cap

The bonding curve market cap is computed as:

$$marketCap = \frac{virtualSolReserves \times mintSupply}{virtualTokenReserves}$$

```typescript
import { bondingCurveMarketCap } from "@nirholas/pump-sdk";

const mcap = bondingCurveMarketCap({
  mintSupply: bondingCurve.tokenTotalSupply,
  virtualQuoteReserves: bondingCurve.virtualQuoteReserves,
  virtualTokenReserves: bondingCurve.virtualTokenReserves,
});
// Returns BN in lamports
```

The market cap is used by the [fee tier system](./fee-tiers.md) to determine which fee rates apply.

## Graduation

A bonding curve is "complete" when `realTokenReserves` reaches zero — all available tokens have been purchased. At that point:

1. `bondingCurve.complete` becomes `true`
2. The token is eligible for migration to a PumpAMM pool
3. No more buy/sell operations are possible on the bonding curve
4. Use `migrateInstruction()` to move the token to an AMM pool

```typescript
if (bondingCurve.complete) {
  // Token has graduated — migrate to AMM
  const ix = await PUMP_SDK.migrateInstruction({
    withdrawAuthority: global.withdrawAuthority,
    mint,
    user: wallet.publicKey,
  });
}
```

### October 2026: synthetic migration and fees kept on the curve

- **A `buy_v3` that crosses the remaining supply no longer fails.** It buys the curve's last `realTokenReserves`, completes the curve, and fills the rest of the order against the canonical PumpSwap pool in the same instruction. The logs carry `TradeEvent` (curve part), `CompleteEvent`, then `PostCompleteBuyEvent` (pool part), and the buyer's total is the sum of both parts. The curve records the pool part in `postCompleteBaseOut` / `postCompleteQuoteIn`. The "cap at real reserves" step above still describes the curve part; quote a completing buy with `getBuyV3TokenAmountFromQuoteAmount` from `@pump-fun/pump-sdk` 4.0.0, which includes the pool part (it needs `curveBaseTokenBalance`, the curve's token account balance). Mayhem curves get no synthetic migration: the quote stops at the remaining supply, and the buy needs `partialFill` set or it fails with `NotEnoughTokensToBuy`.
- **`buy_v3` / `sell_v3` keep the protocol and creator fee in the curve's balance** and count them in `BondingCurve.protocolFees` / `creatorFee` until a permissionless `sweep_protocol_fee` / `sweep_creator_fee` pays them out. They are not liquidity, so the formulas on this page are unchanged.

See [tutorial 55](../../tutorials/55-october-2026-trade-upgrade.md) and the [upstream synthetic migration spec](https://github.com/pump-fun/pump-public-docs/blob/main/docs/SYNTHETIC_MIGRATION.md).

## Migrated Curves

Once a bonding curve has been migrated, its `virtualTokenReserves` is set to zero. All SDK math functions return `BN(0)` when they detect this:

```typescript
// migrated bonding curve
if (bondingCurve.virtualTokenReserves.eq(new BN(0))) {
  return new BN(0); // No more bonding curve trading
}
```

## Worked Example

Starting with typical initial reserves:

| Parameter | Value |
|-----------|-------|
| `initialVirtualTokenReserves` | 1,073,000,000,000,000 |
| `initialVirtualSolReserves` | 30,000,000,000 (30 SOL) |
| `initialRealTokenReserves` | 793,100,000,000,000 |
| `tokenTotalSupply` | 1,000,000,000,000,000 (1B tokens) |

**Initial price per token:**

$$price = \frac{virtualSolReserves}{virtualTokenReserves} = \frac{30 \times 10^9}{1.073 \times 10^{15}} \approx 0.000028 \text{ SOL}$$

**Buying 0.1 SOL worth of tokens (ignoring fees):**

$$tokens = \frac{0.1 \times 10^9 \times 1.073 \times 10^{15}}{30 \times 10^9 + 0.1 \times 10^9} \approx 3,563,120,053,120$$

After this trade, the new reserves would be:
- `virtualTokenReserves` ≈ 1,069,436,879,946,880
- `virtualSolReserves` = 30,100,000,000

The price has increased slightly because the ratio changed.

## Price Impact

Larger trades cause more price impact (slippage). The constant-product formula naturally provides:

- **Small trades** → minimal price impact
- **Large trades** → significant price impact
- **Approaching graduation** → very high price impact (fewer `realTokenReserves` left)

Use the `slippage` parameter in `buyInstructions()` / `sellInstructions()` to set maximum acceptable slippage as a percentage.

## Related

- [Fee Tiers](./fee-tiers.md) — How fee rates are determined by market cap
- [Token Lifecycle](../README.md#-token-lifecycle) — Full lifecycle from creation to AMM
- [API Reference](../api-reference.md) — Complete function signatures
- [Examples](../examples.md) — Working code samples

