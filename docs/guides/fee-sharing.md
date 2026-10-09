# Fee Sharing Guide

Set up and manage creator fee distribution among multiple shareholders.

<div align="center">
  <img src="assets/pump.svg" alt="Fee sharing flow — trades to creator vault to shareholders" width="720">
</div>

## Overview

Fee sharing allows token creators to split their accumulated trading fees among up to 10 shareholders. This is managed through the **PumpFees** program and works for both bonding curve tokens and graduated AMM tokens.

## Sweep first (October 2026 upgrade)

Since the October 2026 upgrade, `buy_v3` / `sell_v3` on the curve and `buy_v2` / `sell_v2` on PumpSwap keep the creator fee where the trade happened (`BondingCurve.creator_fee`, `Pool.creator_fees`) instead of paying the creator vault on every trade. Every instruction in this guide that changes the creator or pays the vault out refuses to run while such a fee waits:

| Instruction | Error if not swept |
|---|---|
| `create_fee_sharing_config` | `CreatorFeesNotSwept` 6095 (Pump) or 6081 (PumpSwap) |
| `update_fee_shares` / `update_fee_shares_v2` | `PoolCreatorFeesNotSwept` 6033 (Pump Fees), or 6095 from the distribution it runs first |
| `distribute_creator_fees` / `distribute_creator_fees_v2` | `CreatorFeesNotSwept` 6095 |

Put the permissionless sweeps first in the **same** transaction (a v3 trade between two transactions leaves a new fee behind). `getCreatorFeeSweepInstructions` from `@pumpkit/core` returns exactly the sweeps that are needed, or none. The sweep builders, the new fee fields and `buildDistributeCreatorFeesInstructions` that adds the sweeps itself need `@pump-fun/pump-sdk` 4.0.0 or newer:

```typescript
import { getCreatorFeeSweepInstructions } from "@pumpkit/core";

const sweep = await getCreatorFeeSweepInstructions(connection, mint, wallet.publicKey);
const tx = new Transaction().add(...sweep.instructions, ix); // ix: the instruction from any step below
```

A full, typechecked walkthrough is in [tutorial 47](../../tutorials/47-v2-creator-fees.md); background in [tutorial 55](../../tutorials/55-october-2026-trade-upgrade.md) and the upstream [SWEEP_FEES.md](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/SWEEP_FEES.md).

## Prerequisites

```typescript
import { Connection, PublicKey, Transaction, Keypair } from "@solana/web3.js";
import {
  PUMP_SDK,
  OnlinePumpSdk,
  isCreatorUsingSharingConfig,
  feeSharingConfigPda,
} from "@nirholas/pump-sdk";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const onlineSdk = new OnlinePumpSdk(connection);
```

## Step 1: Create a Fee Sharing Config

After creating a token, set up fee sharing:

```typescript
const mint = new PublicKey("your-token-mint");
const creator = wallet.publicKey;

// For non-graduated tokens (still on bonding curve):
const ix = await PUMP_SDK.createFeeSharingConfig({
  creator,
  mint,
  pool: null,
});

// For graduated tokens (on AMM), you must provide the pool:
import { canonicalPumpPoolPda } from "@nirholas/pump-sdk";
const pool = canonicalPumpPoolPda(mint);

const ix = await PUMP_SDK.createFeeSharingConfig({
  creator,
  mint,
  pool,
});
```

> **Note:** For graduated tokens (`bondingCurve.complete === true`), you must provide the pool address. For ungraduated tokens, pass `pool: null`. Send the creator fee sweeps first in the same transaction (see [Sweep first](#sweep-first-october-2026-upgrade)).

After this instruction the curve creator (and `pool.coin_creator` if graduated) is the `sharing_config` PDA, and the default shareholder list is the creator alone at 10,000 bps.

## Step 2: Set Up Shareholders

Define how fees are split. Shares are in basis points (bps), where 10,000 bps = 100%.

```typescript
const shareholders = [
  { address: new PublicKey("wallet-A"), shareBps: 5000 }, // 50%
  { address: new PublicKey("wallet-B"), shareBps: 3000 }, // 30%
  { address: new PublicKey("wallet-C"), shareBps: 2000 }, // 20%
];

const ix = await PUMP_SDK.updateFeeShares({
  authority: creator,          // The config admin
  mint,
  currentShareholders: [creator], // set by createFeeSharingConfig
  newShareholders: shareholders,
});
```

`updateFeeShares` is for SOL-quoted coins. For a USDC or pump-coin quoted coin use `updateFeeSharesV2`, which also takes `quoteMint` and `quoteTokenProgram` (`OnlinePumpSdk.fetchQuoteTokenProgram(quoteMint)`). Both distribute pending fees to the current shareholders before applying the new list, so sweep first.

### Validation Rules

The SDK validates shareholders before building the instruction:

| Rule | Error |
|------|-------|
| At least 1 shareholder | `NoShareholdersError` |
| Maximum 10 shareholders | `TooManyShareholdersError` |
| No zero shares | `ZeroShareError` |
| Shares sum to 10,000 bps | `InvalidShareTotalError` |
| No duplicate addresses | `DuplicateShareholderError` |

## Step 3: Check Distributable Fees

Before distributing, check if there are enough accumulated fees:

```typescript
const result = await onlineSdk.getMinimumDistributableFee(mint);

console.log("Minimum required:", result.minimumRequired.toString());
console.log("Available:", result.distributableFees.toString());
console.log("Can distribute:", result.canDistribute);
console.log("Token graduated:", result.isGraduated);
```

## Step 4: Distribute Fees

When fees are ready, build and send the distribution transaction:

```typescript
const { instructions, isGraduated, sweepCount } =
  await onlineSdk.buildDistributeCreatorFeesInstructions(mint, { payer: wallet.publicKey });

const tx = new Transaction().add(...instructions);
const sig = await sendAndConfirmTransaction(connection, tx, [wallet]);
```

For graduated tokens, the method automatically includes a `transferCreatorFeesToPump` instruction to consolidate AMM vault fees before distributing. With `@pump-fun/pump-sdk` 4.0.0 the first `sweepCount` instructions are the creator fee sweeps; pass `payer` so the pool sweep is included. A large sharing config can exceed one legacy transaction, so send it as a v0 transaction with an address lookup table rather than splitting the sweeps off.

## Checking Fee Sharing Status

Verify whether a creator has already set up fee sharing:

```typescript
const isSharing = isCreatorUsingSharingConfig({ mint, creator });

if (isSharing) {
  // Fee sharing is active
  const configAddress = feeSharingConfigPda(mint);
  // ... decode and inspect the config
}
```

## Updating Shareholders

The update revokes the admin, so a second call on the same config fails with `SharingConfigAdminRevoked` (6009, "sharing config can only be updated once"). The parameters below show the shape of an update while the admin is still active: pass both current and new shareholders, and sweep first.

```typescript
const currentShareholders = [
  new PublicKey("wallet-A"),
  new PublicKey("wallet-B"),
  new PublicKey("wallet-C"),
];

const newShareholders = [
  { address: new PublicKey("wallet-A"), shareBps: 6000 },
  { address: new PublicKey("wallet-D"), shareBps: 4000 },
];

const ix = await PUMP_SDK.updateFeeShares({
  authority: creator,
  mint,
  currentShareholders,  // PublicKey[] of current shareholders
  newShareholders,
});
```

## Collecting Creator Fees (Without Sharing)

If fee sharing is not set up, creators can collect fees directly:

```typescript
// Sweep fees v3 / pool v2 trades kept back, then collect from both programs
const sweep = await getCreatorFeeSweepInstructions(connection, mint, creator);
const instructions = [
  ...sweep.instructions,
  ...(await onlineSdk.collectCoinCreatorFeeInstructions(creator)), // SOL vaults
];
// For USDC or pump-coin quotes: onlineSdk.collectCoinCreatorFeeAllQuotesInstructions(creator)

// Check balance before collecting
const balance = await onlineSdk.getCreatorVaultBalanceBothPrograms(creator);
console.log("Uncollected fees:", balance.toString(), "lamports");
```

## Social Fee PDAs

For platform-based fee routing (e.g., tipping by username rather than wallet address), the SDK supports social fee PDAs.

```typescript
// Create a social fee PDA for a platform user
const ix = await PUMP_SDK.createSocialFeePdaInstruction({
  payer: wallet.publicKey,
  userId: "user123",
  platform: 1,   // platform identifier
});

// Claim fees routed to a social fee PDA
const ix2 = await PUMP_SDK.claimSocialFeePdaInstruction({
  recipient: wallet.publicKey,
  socialClaimAuthority: authorityKeypair.publicKey,
  userId: "user123",
  platform: 1,
});
```

## Authority Management

The fee sharing config has an admin who can update shareholders. The SDK provides methods to transfer, reset, or permanently revoke this authority.

### Transfer Authority

Transfer admin control to a new address:

```typescript
const ix = await PUMP_SDK.transferFeeSharingAuthorityInstruction({
  authority: wallet.publicKey,  // current admin
  mint,
  newAdmin: newAdminPublicKey,
});
```

### Reset Config

Reset the fee sharing configuration and assign a new admin:

```typescript
const ix = await PUMP_SDK.resetFeeSharingConfigInstruction({
  authority: wallet.publicKey,
  mint,
  newAdmin: newAdminPublicKey,
});
```

### Revoke Authority (Irreversible)

Permanently lock the fee sharing configuration. After this, no one can modify shareholders.

```typescript
const ix = await PUMP_SDK.revokeFeeSharingAuthorityInstruction({
  authority: wallet.publicKey,
  mint,
});
```

> **Warning:** Revoking is permanent. The `adminRevoked` flag in `SharingConfig` will be set to `true` and no further changes are possible.


