# Tutorial 9: Understanding the Fee System

> How Pump's tiered fee system works and how to calculate fees off-chain.

## Fee Overview

Every buy/sell on Pump incurs two types of fees:

| Fee | Goes To |
|-----|---------|
| **Protocol fee** | Pump protocol treasury |
| **Creator fee** | Token creator (or sharing config shareholders) |

Fees are calculated in **basis points (BPS)** where 100 BPS = 1%.

### When the fee is paid (October 2026 upgrade)

The amount is the same for every instruction; only the moment it moves differs:

| Instructions | Protocol and creator fee |
|---|---|
| Curve `buy` / `sell` / `buy_v2` / `sell_v2` / `buy_exact_quote_in_v2`, PumpSwap `buy` / `sell` / `buy_exact_quote_in` | Paid out in the trade |
| Curve `buy_v3` / `sell_v3` / `buy_exact_quote_in_v3` | Kept on the curve in `BondingCurve.protocol_fees` / `creator_fee` |
| PumpSwap `buy_v2` / `sell_v2` / `buy_exact_quote_in_v2`, `multi_hop_swap` | Kept in the pool in `Pool.protocol_fees` / `creator_fees` (curve hops keep theirs on the curve) |

The buyback part of the protocol fee and the PumpSwap LP fee are always paid in the trade. Kept fees are paid out by the permissionless `sweep_protocol_fee` (pump.fun runs it) and `sweep_creator_fee` (put it first in the transaction that collects or distributes creator fees). The v3 `TradeEvent` reports the fee amounts with `fee_recipient` set to the zero key. Details: [tutorial 55](./55-october-2026-trade-upgrade.md), [tutorial 47](./47-v2-creator-fees.md).

## Tiered Fee Structure

Fees vary based on the bonding curve's **market cap**. Higher market cap = different fee tier:

```typescript
import { Connection, PublicKey } from "@solana/web3.js";
import { OnlinePumpSdk, bondingCurveMarketCap } from "@nirholas/pump-sdk";
import { computeFeesBps } from "@nirholas/pump-sdk/fees";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const onlineSdk = new OnlinePumpSdk(connection);
const mint = new PublicKey("YOUR_MINT");

const global = await onlineSdk.fetchGlobal();
const feeConfig = await onlineSdk.fetchFeeConfig();
const bondingCurve = await onlineSdk.fetchBondingCurve(mint);
```

## Calculating Fees for a Trade

```typescript
import { computeFeesBps } from "@nirholas/pump-sdk";
import BN from "bn.js";

// Get the current fee tier
const { protocolFeeBps, creatorFeeBps } = computeFeesBps({
  global,
  feeConfig,
  mintSupply: bondingCurve.tokenTotalSupply,
  virtualQuoteReserves: bondingCurve.virtualQuoteReserves,
  virtualTokenReserves: bondingCurve.virtualTokenReserves,
});

console.log("Protocol fee:", protocolFeeBps.toString(), "BPS");
console.log("Creator fee:", creatorFeeBps.toString(), "BPS");
console.log("Total fee:", protocolFeeBps.add(creatorFeeBps).toString(), "BPS");

// Calculate fee amount on a 1 SOL trade
const tradeAmount = new BN(1_000_000_000); // 1 SOL
const protocolFee = tradeAmount.mul(protocolFeeBps).divn(10_000);
const creatorFee = tradeAmount.mul(creatorFeeBps).divn(10_000);

console.log("Protocol fee on 1 SOL:", protocolFee.toNumber() / 1e9, "SOL");
console.log("Creator fee on 1 SOL:", creatorFee.toNumber() / 1e9, "SOL");
```

## FeeConfig Structure

The `FeeConfig` account holds the fee tiers:

```typescript
interface FeeConfig {
  admin: PublicKey;
  flatFees: Fees;         // Default fees when no tier matches
  feeTiers: FeeTier[];     // Market-cap-based tiers
}

interface FeeTier {
  marketCapLamportsThreshold: BN;  // Market cap threshold
  fees: Fees;
}

interface Fees {
  lpFeeBps: BN;
  protocolFeeBps: BN;
  creatorFeeBps: BN;
}
```

## How Fee Tiers Are Selected

The SDK's `calculateFeeTier` function selects the appropriate tier:

```typescript
import { calculateFeeTier } from "@nirholas/pump-sdk";

// Calculate current market cap
const marketCap = bondingCurveMarketCap({
  mintSupply: bondingCurve.tokenTotalSupply,
  virtualQuoteReserves: bondingCurve.virtualQuoteReserves,
  virtualTokenReserves: bondingCurve.virtualTokenReserves,
});

// Find the matching fee tier
const fees = calculateFeeTier({
  feeTiers: feeConfig.feeTiers,
  marketCap,
});

console.log("Active fee tier:");
console.log("  Protocol:", fees.protocolFeeBps.toString(), "BPS");
console.log("  Creator:", fees.creatorFeeBps.toString(), "BPS");
console.log("  LP:", fees.lpFeeBps.toString(), "BPS");
```

The algorithm:
1. If market cap < first tier threshold → use first tier
2. Otherwise, find the highest tier where market cap >= threshold

## Creator Fee Destinations

Creator fees go to different places depending on configuration:

```typescript
import { isCreatorUsingSharingConfig } from "@nirholas/pump-sdk";

const bc = await onlineSdk.fetchBondingCurve(mint);

if (PublicKey.default.equals(bc.creator)) {
  console.log("No creator set — creator fees are burned");
} else if (isCreatorUsingSharingConfig({ mint, creator: bc.creator })) {
  console.log("Creator fees → fee sharing config → multiple shareholders");
} else {
  console.log("Creator fees → single creator wallet:", bc.creator.toBase58());
}
```

Whichever destination applies, fees from v3 curve trades reach it only after `sweep_creator_fee` (pending amount: `bc.creatorFee` with `@pump-fun/pump-sdk` 4.0.0), and fees from PumpSwap v2 trades only after the pool's `sweep_creator_fee` (`Pool.creator_fees`, read with `decodePumpPool` from `@pumpkit/core`).

## Simulating Fees Before Trading

Build a fee calculator to preview costs:

```typescript
function previewTrade(solAmount: BN, isBuy: boolean) {
  const { protocolFeeBps, creatorFeeBps } = computeFeesBps({
    global,
    feeConfig,
    mintSupply: bondingCurve.tokenTotalSupply,
    virtualQuoteReserves: bondingCurve.virtualQuoteReserves,
    virtualTokenReserves: bondingCurve.virtualTokenReserves,
  });

  const totalFeeBps = protocolFeeBps.add(creatorFeeBps);
  const feeAmount = solAmount.mul(totalFeeBps).divn(10_000);
  const netAmount = solAmount.sub(feeAmount);

  return {
    grossAmount: solAmount.toString(),
    totalFeeBps: totalFeeBps.toString(),
    feeAmount: feeAmount.toString(),
    netAmount: netAmount.toString(),
    protocolFee: solAmount.mul(protocolFeeBps).divn(10_000).toString(),
    creatorFee: solAmount.mul(creatorFeeBps).divn(10_000).toString(),
  };
}

console.log(previewTrade(new BN(1_000_000_000), true));
```

## What's Next?

- [Tutorial 7: Set Up Fee Sharing](./07-fee-sharing.md)
- [Tutorial 10: Working with PDAs](./10-working-with-pdas.md)

