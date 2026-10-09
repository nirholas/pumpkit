# Tutorial 34: AMM Liquidity Operations

> Provide liquidity, deposit, withdraw, and trade on graduated PumpAMM pools — LP tokens, price impact, and coin-creator fees.

## Prerequisites

- Node.js 18+
- `@nirholas/pump-sdk` installed
- A graduated token (bonding curve complete)

```bash
npm install @nirholas/pump-sdk @solana/web3.js bn.js
```

## Architecture

When a token's bonding curve reaches its SOL cap, it "graduates" to PumpAMM — a full AMM pool with LP tokens:

```
┌─────────────┐    graduation    ┌──────────────┐
│   Pump       │ ─────────────► │   PumpAMM     │
│ BondingCurve │                │     Pool       │
│ complete=true│                │ base + quote   │
└─────────────┘                │ LP tokens      │
                               └──────────────┘
```

**PumpAMM Program**: `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA`

## Step 1: Fetch Pool State

```typescript
import { OnlinePumpSdk } from "@nirholas/pump-sdk";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import BN from "bn.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const sdk = new OnlinePumpSdk(connection);

const mint = new PublicKey("YourGraduatedTokenMint...");

// Fetch pool by mint
const pool = await sdk.fetchPool(mint);

console.log("Pool state:", {
  creator: pool.creator.toBase58(),
  baseMint: pool.baseMint.toBase58(),   // Token mint
  quoteMint: pool.quoteMint.toBase58(), // WSOL
  lpMint: pool.lpMint.toBase58(),
  lpSupply: pool.lpSupply.toString(),
  coinCreator: pool.coinCreator.toBase58(),
  isMayhemMode: pool.isMayhemMode,
  isCashbackCoin: pool.isCashbackCoin,
  poolBump: pool.poolBump,
  index: pool.index,
});

// Or fetch pool by its address directly
const poolByAddr = await sdk.fetchPoolByAddress(poolAddress);
```

## Step 2: AMM Buy (Trade SOL → Token)

```typescript
const user = Keypair.generate();

// Standard buy — specify max SOL to spend
const buyIxs = await sdk.ammBuyInstruction({
  user: user.publicKey,
  mint,
  bondingCurveSolAmountToSpend: new BN(100_000_000), // 0.1 SOL
  slippageBps: 500, // 5%
});

console.log(`Buy: ${buyIxs.length} instructions`);

// Exact quote buy — spend exactly this much SOL
const exactBuyIxs = await sdk.ammBuyExactQuoteInInstruction({
  user: user.publicKey,
  mint,
  exactQuoteIn: new BN(50_000_000), // Exactly 0.05 SOL
  slippageBps: 300, // 3%
});
```

## Step 3: AMM Sell (Trade Token → SOL)

```typescript
const sellIxs = await sdk.ammSellInstruction({
  user: user.publicKey,
  mint,
  tokenAmountToSell: new BN("1000000000"), // 1 token (9 decimals)
  slippageBps: 500,
});

console.log(`Sell: ${sellIxs.length} instructions`);
```

## Step 3b: October 2026 Upgrade (v2 Trades, Signed Reserves, Sweeps)

PumpSwap's October 2026 upgrade changed three things this tutorial touches:

1. **v2 trades.** `buy_v2`, `sell_v2` and `buy_exact_quote_in_v2` price exactly like v1 but keep the protocol and coin-creator fee in the pool's quote vault (`Pool.protocolFees`, `Pool.creatorFees`) instead of paying them on every trade. Cashback pools refuse v2 (6079), so keep v1 for them; mayhem pools work with v2.
2. **Signed reserves.** `Pool.virtualQuoteReserves` is now a signed `i128`. Each fee a v2 trade keeps is subtracted from it, so the pool prices against `vault balance + virtualQuoteReserves` and the kept fees never count as liquidity. A negative value is normal.
3. **Sweeps.** The kept fees leave the pool through the permissionless `sweep_protocol_fee` / `sweep_creator_fee`. A creator collect only sees what has been swept into the creator vault, so sweep first, in the same transaction.

Older pools keep the shorter account layout until something grows them. `deposit` and `withdraw` on such a pool need `extend_account` first; v2 trades grow the pool themselves.

The official `@pump-fun/pump-swap-sdk` 2.1.0 handles all of this:

```bash
npm install @pump-fun/pump-swap-sdk@2.1.0 @solana/web3.js bn.js
```

```typescript
import {
  OnlinePumpAmmSdk,
  PUMP_AMM_SDK,
  canonicalPumpPoolPda,
  supportsTradeV2,
} from "@pump-fun/pump-swap-sdk";
import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";

const connection = new Connection(process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com");
const online = new OnlinePumpAmmSdk(connection);

const mint = new PublicKey(process.argv[2]!); // a graduated coin
const user = new PublicKey(process.argv[3]!); // the wallet that will sign
const poolKey = canonicalPumpPoolPda(mint);

// v2 buy: same pricing as v1, fees stay in the pool until a sweep
const swapState = await online.swapSolanaState(poolKey, user);
const buyIxs = await PUMP_AMM_SDK.buyQuoteInput(
  swapState,
  new BN(100_000_000), // 0.1 SOL in, fees included
  5,                   // 5% slippage
  { v2: true },        // v2 when the pool supports it, v1 otherwise
);
console.log("v2 eligible:", supportsTradeV2(swapState.pool), "buy ixs:", buyIxs.length);

// Pool fields added by the upgrade
const pool = swapState.pool;
console.log({
  virtualQuoteReserves: pool.virtualQuoteReserves.toString(), // signed, often negative
  protocolFees: pool.protocolFees.toString(),
  creatorFees: pool.creatorFees.toString(),
});

// Deposit and withdraw: the SDK prepends extend_account for a pre-upgrade pool
const liquidityState = await online.liquiditySolanaState(poolKey, user);
const depositIxs = await PUMP_AMM_SDK.depositInstructions(liquidityState, new BN(1_000_000), 1);
const withdrawIxs = await PUMP_AMM_SDK.withdrawInstructions(liquidityState, new BN(1_000_000), 1);
console.log("deposit ixs:", depositIxs.length, "withdraw ixs:", withdrawIxs.length);

// Sweep the pool's creator fee into the creator vault, then collect it
const sweepIx = await online.sweepCreatorFeeInstruction(poolKey, user);
const collectState = await online.collectCoinCreatorFeeSolanaState(pool.coinCreator, undefined, pool.quoteMint);
const collectIxs = await PUMP_AMM_SDK.collectCoinCreatorFee(collectState, user);
console.log("sweep + collect ixs:", 1 + collectIxs.length);
```

Run against a live graduated pool (October 2026), this printed a `virtualQuoteReserves` of `-391886` with `creatorFees` of `391886`: the v2 trades had kept 391,886 lamports of creator fee in the pool and the reserve went negative by the same amount. Read the pool with a signed decoder (`decodePumpPool` and `effectivePoolQuoteReserves` from `@pumpkit/core` do this without the SDK). Payouts are always capped by the real vault (`InsufficientRealQuoteReserves`, 6063). For the full picture see [AMM Trading](../docs/amm-trading.md#signed-virtual_quote_reserves) and [Tutorial 55](./55-october-2026-trade-upgrade.md).

## Step 4: Deposit Liquidity

Add liquidity to earn LP tokens:

```typescript
const depositIxs = await sdk.ammDepositInstruction({
  user: user.publicKey,
  pool: poolAddress,
  mint,
  maxBaseAmountIn: new BN("10000000000"),   // Max 10 tokens
  maxQuoteAmountIn: new BN(1_000_000_000),  // Max 1 SOL
  minLpTokenAmountOut: new BN(1),           // Min LP tokens to receive
});

console.log(`Deposit: ${depositIxs.length} instructions`);

// Tip: Calculate expected LP tokens first
// LP tokens = proportional to share of pool reserves
```

## Step 5: Withdraw Liquidity

Burn LP tokens to reclaim base + quote tokens:

```typescript
const withdrawIxs = await sdk.ammWithdrawInstruction({
  user: user.publicKey,
  pool: poolAddress,
  mint,
  lpTokenAmountIn: new BN("500000"),         // LP tokens to burn
  minBaseAmountOut: new BN("1000000000"),     // Min tokens to receive
  minQuoteAmountOut: new BN(100_000_000),     // Min SOL to receive
});

console.log(`Withdraw: ${withdrawIxs.length} instructions`);
```

## Step 6: Coin Creator Operations

The original token creator can claim fees and manage their role. Since the October 2026 upgrade, fees from v2 trades wait in the pool (`creatorFees`) until `sweep_creator_fee` moves them into the creator vault, so put the sweep from Step 3b in front of the collect. Changing the coin creator, creating a fee-sharing config or updating fee shares while `creatorFees` is nonzero fails (`CreatorFeesNotSwept`, 6081), so those need the sweep in the same transaction too.

```typescript
const coinCreator = Keypair.generate(); // Original creator

// Collect accumulated coin-creator fees
const collectIxs = await sdk.ammCollectCoinCreatorFeeInstruction({
  creator: coinCreator.publicKey,
  mint,
});

// Migrate coin-creator role to a new address
const migrateIxs = await sdk.ammMigratePoolCoinCreatorInstruction({
  creator: coinCreator.publicKey,
  mint,
  newCreator: newCreatorAddress,
});

// Set coin creator on the pool
const setIxs = await sdk.ammSetCoinCreatorInstruction({
  creator: coinCreator.publicKey,
  mint,
});
```

## Step 7: Pool Events

Listen for deposit/withdraw events:

```typescript
import { EventParser, BorshCoder } from "@coral-xyz/anchor";

// DepositEvent fields:
// - pool, user, baseMint, quoteMint, lpMint
// - baseAmountDeposited, quoteAmountDeposited, lpTokensMinted

// WithdrawEvent fields:
// - pool, user, baseMint, quoteMint, lpMint
// - baseAmountWithdrawn, quoteAmountWithdrawn, lpTokensBurned

connection.onLogs(pumpAmmProgramId, (logs) => {
  for (const event of parser.parseLogs(logs.logs)) {
    switch (event.name) {
      case "DepositEvent":
        console.log("Deposit:", {
          base: event.data.baseAmountDeposited.toString(),
          quote: event.data.quoteAmountDeposited.toString(),
          lp: event.data.lpTokensMinted.toString(),
        });
        break;
      case "WithdrawEvent":
        console.log("Withdraw:", {
          base: event.data.baseAmountWithdrawn.toString(),
          quote: event.data.quoteAmountWithdrawn.toString(),
          lp: event.data.lpTokensBurned.toString(),
        });
        break;
    }
  }
});
```

## Step 8: Full Lifecycle Example

```typescript
async function ammLifecycle(
  sdk: OnlinePumpSdk,
  user: PublicKey,
  mint: PublicKey
) {
  // 1. Check token is graduated
  const bc = await sdk.fetchBondingCurve(mint);
  if (!bc.complete) {
    throw new Error("Token not yet graduated — trade on bonding curve");
  }

  // 2. Fetch pool
  const pool = await sdk.fetchPool(mint);
  const poolAddress = pool.address;

  // 3. Buy tokens on AMM
  const buyIxs = await sdk.ammBuyInstruction({
    user,
    mint,
    bondingCurveSolAmountToSpend: new BN(500_000_000), // 0.5 SOL
    slippageBps: 500,
  });

  // 4. Deposit liquidity
  const depositIxs = await sdk.ammDepositInstruction({
    user,
    pool: poolAddress,
    mint,
    maxBaseAmountIn: new BN("5000000000"),
    maxQuoteAmountIn: new BN(500_000_000),
    minLpTokenAmountOut: new BN(1),
  });

  // 5. Later: withdraw
  const withdrawIxs = await sdk.ammWithdrawInstruction({
    user,
    pool: poolAddress,
    mint,
    lpTokenAmountIn: new BN("250000"),
    minBaseAmountOut: new BN(1),
    minQuoteAmountOut: new BN(1),
  });

  return { buyIxs, depositIxs, withdrawIxs };
}
```

## Pool State Reference

| Field | Type | Description |
|-------|------|-------------|
| `poolBump` | `number` | PDA bump seed |
| `index` | `number` | Pool index |
| `creator` | `PublicKey` | Initial pool creator |
| `baseMint` | `PublicKey` | Token mint (the launched token) |
| `quoteMint` | `PublicKey` | Quote mint (WSOL) |
| `lpMint` | `PublicKey` | LP token mint |
| `lpSupply` | `BN` | Total LP tokens outstanding |
| `coinCreator` | `PublicKey` | Original coin creator (fee recipient) |
| `isMayhemMode` | `boolean` | Created in Mayhem Mode |
| `isCashbackCoin` | `boolean` | Has cashback enabled |
| `virtualQuoteReserves` | `BN` (signed `i128`) | Boost minus the fees kept by v2 trades. Price with `vault balance + virtualQuoteReserves`. Reads as 0 on pools that predate the field |
| `creatorFeeBps` | `BN` | Per-pool creator fee rate; 0 means the fee schedule's rate applies |
| `isHolderReward` | `boolean` | Creator fees go to the coin's holder-rewards PDA |
| `protocolFees` | `BN` | Protocol fee kept by v2 trades, waiting for `sweep_protocol_fee` |
| `creatorFees` | `BN` | Creator fee kept by v2 trades, waiting for `sweep_creator_fee` |

## Next Steps

- See [Tutorial 07](./07-fee-sharing.md) for fee configuration on these pools
- See [Tutorial 29](./29-event-parsing-analytics.md) for full event parsing
- See [Tutorial 55](./55-october-2026-trade-upgrade.md) for v3/v2 trades, multi-hop swaps and fee sweeps
