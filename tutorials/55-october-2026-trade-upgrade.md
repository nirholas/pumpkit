# Tutorial 55: Trading, Claiming and Indexing After the October 2026 Pump Upgrade

> Audience: anyone whose bot, dashboard or claim flow builds Pump or PumpSwap instructions, quotes trades, or parses Pump events.
>
> When to use: now. The new instructions are live on mainnet, and the creator fee flow changed in a way that silently under-pays claim bots that skip it.

## What changed

The October 2026 upgrade adds smaller trade instructions on both programs. They charge the same prices and fees as before. The difference is **where the fees go**: the new trades keep the protocol fee and the creator fee where the trade happened, and anyone can pay them out later with a permissionless sweep.

| Venue | Previous instructions (still work) | New instructions | Accounts | Protocol and creator fee |
|-------|------------------------------------|------------------|----------|--------------------------|
| Bonding curve (Pump) | `buy`, `sell`, `buy_exact_sol_in`, `buy_v2`, `sell_v2`, `buy_exact_quote_in_v2` | `buy_v3`, `sell_v3`, `buy_exact_quote_in_v3` | 17 | Kept on the curve in `BondingCurve.protocol_fees` / `creator_fee` |
| Pool (PumpSwap) | `buy`, `sell`, `buy_exact_quote_in` | `buy_v2`, `sell_v2`, `buy_exact_quote_in_v2` | 17 | Kept in the pool's quote vault, recorded in `Pool.protocol_fees` / `creator_fees` |
| Both | Two transactions and an intermediate token account | `multi_hop_swap` (PumpSwap) | 16 + 5 per hop | Charged once per route |
| Both | Fees paid on every trade | `sweep_protocol_fee`, `sweep_creator_fee` on each program | 13 (Pump), 12 (PumpSwap) | Pays the kept fees out |

Also new:

- **Synthetic migration.** The v3 buy that empties a curve has no maximum size. It takes what the curve has left, completes it, and buys the rest from the tokens that would have gone into the PumpSwap pool. A new `PostCompleteBuyEvent` reports that second part.
- **Signed `Pool.virtual_quote_reserves`.** It is an `i128` and is negative whenever kept fees exceed a pool's boost. Price against `pool_quote_token_account.amount + virtual_quote_reserves`.
- **Pump-coin quote mints.** A coin can be paired with another pump coin, so a `TradeEvent` amount is not always lamports.
- **The buyback part of the protocol fee is still paid in the trade**, to one `buyback_fee_recipient` account, and the PumpSwap LP fee still goes into the reserves on every trade.

Cashback coins cannot use the new trades (`CashbackCoinNotSupported`: 6094 on Pump, 6079 on PumpSwap). Keep `buy_v2` / `sell_v2` on the curve and PumpSwap v1 on the pool for those. Mayhem coins and mayhem pools work with both new trade families.

Packages used below: [`@pump-fun/pump-sdk` 4.0.0](https://www.npmjs.com/package/@pump-fun/pump-sdk/v/4.0.0) and `@pumpkit/core`. PumpSwap-only integrations use [`@pump-fun/pump-swap-sdk` 2.1.0](https://www.npmjs.com/package/@pump-fun/pump-swap-sdk/v/2.1.0); Rust integrations use [`pump-rust-client` 0.4.0](https://crates.io/crates/pump-rust-client/0.4.0).

```bash
npm install @pump-fun/pump-sdk@^4.0.0 @solana/web3.js @solana/spl-token bn.js
```

## 1. Buy on the bonding curve with `buy_exact_quote_in_v3`

`fetchBuyState` returns everything the quote and the builder need, including `curveBaseTokenBalance`, which the v3 quote uses to price the part of a buy that runs past the curve. The builder creates the buyer's token account and, on a token-paired coin, the buyback recipient's token account when they are missing.

```typescript
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';
import { OnlinePumpSdk, PUMP_SDK, getBuyV3TokenAmountFromQuoteAmount } from '@pump-fun/pump-sdk';

export async function buyV3(connection: Connection, wallet: Keypair, mint: PublicKey, quoteAmount: BN) {
  const online = new OnlinePumpSdk(connection);
  const [global, feeConfig, state] = await Promise.all([
    online.fetchGlobal(),
    online.fetchFeeConfig(),
    online.fetchBuyState(mint, wallet.publicKey, TOKEN_2022_PROGRAM_ID),
  ]);

  const tokensOut = getBuyV3TokenAmountFromQuoteAmount({
    global,
    feeConfig,
    mintSupply: state.bondingCurve.tokenTotalSupply,
    bondingCurve: state.bondingCurve,
    amount: quoteAmount,
    curveBaseTokenBalance: state.curveBaseTokenBalance,
  });

  const instructions = await PUMP_SDK.buyExactQuoteInV3Instructions({
    bondingCurve: state.bondingCurve,
    associatedUserAccountInfo: state.associatedUserAccountInfo,
    mint,
    user: wallet.publicKey,
    amount: tokensOut,
    quoteAmount,
    slippage: 1,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    quoteTokenProgram: state.quoteTokenProgram,
  });

  return sendAndConfirmTransaction(connection, new Transaction().add(...instructions), [wallet]);
}
```

`buy_v3` (exact tokens out, `buyV3Instructions`) takes the same parameters, with `amount` as the tokens wanted and `quoteAmount` as the most you will pay, from `getBuyV3QuoteAmountFromTokenAmount`.

Pass `mintSupply: state.bondingCurve.tokenTotalSupply` as above. Fee tiers are computed on a one-billion supply for every coin except mayhem coins, which use the mint's real supply; the `@pumpkit/core` helpers below read it from the mint for you.

## 2. Quote a v3 buy, including one that completes the curve

`@pumpkit/core` wraps the official quote functions. `crossesCurve` tells you the buy will complete the curve and continue into the pool-to-be:

```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { getBuyV3Quote, getBuyV3Cost } from '@pumpkit/core';

const connection = new Connection(process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com');
const mint = new PublicKey(process.argv[2]!);
const user = new PublicKey(process.argv[3]!);

const quote = await getBuyV3Quote(connection, mint, user, new BN(2_000_000_000));
if (!quote) {
  console.log('No v3 quote: the curve is missing or complete (trade on PumpSwap instead).');
} else {
  console.log(`2 quote units buy ${quote.tokens.toString()} base units of ${mint.toBase58()}`);
  if (quote.crossesCurve) console.log('This buy completes the curve and continues into the pool-to-be.');
}

const cost = await getBuyV3Cost(connection, mint, user, new BN(10_000_000_000_000));
if (cost) console.log(`10M tokens cost ${cost.quoteAmount.toString()} (max_sol_cost before slippage)`);
```

Both helpers return `null` when the curve does not exist or is already complete. A complete curve refuses every trade (`BondingCurveComplete`, 6005) until the migration lands, so trade on PumpSwap after that.

The off-chain math for the pool part, from the [synthetic migration spec](../docs/pump-protocol/SYNTHETIC_MIGRATION.md):

```text
remaining   = bonding_curve.real_token_reserves
curve_quote = the usual bonding curve cost for `remaining` tokens
pool_base   = associated_base_bonding_curve.amount - remaining
pool_quote  = bonding_curve.real_quote_reserves + curve_quote - Global.pool_migration_fee   (SOL-paired)
            = bonding_curve.real_quote_reserves + curve_quote                               (token-paired)

buy_v3, extra tokens `out`:            quote_in = ceil(pool_quote * out / (pool_base - out))
buy_exact_quote_in_v3, net budget `in`: out     = floor((in - 1) * pool_base / (pool_quote + in - 1))
```

Rules worth knowing:

- `max_sol_cost` and `min_tokens_out` cover both parts of the buy.
- Only the buy that crosses the limit gets this. `buy`, `buy_v2` and `buy_exact_quote_in_v2` still fail with `NotEnoughTokensToBuy` (6021) past what is left.
- Mayhem coins never get a synthetic migration. `partial_fill` controls them as before.

## 3. Sell with `sell_v3`

```typescript
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';
import { OnlinePumpSdk, PUMP_SDK, getSellSolAmountFromTokenAmount } from '@pump-fun/pump-sdk';

export async function sellV3(connection: Connection, wallet: Keypair, mint: PublicKey, amount: BN) {
  const online = new OnlinePumpSdk(connection);
  const [global, feeConfig, state] = await Promise.all([
    online.fetchGlobal(),
    online.fetchFeeConfig(),
    online.fetchSellState(mint, wallet.publicKey, TOKEN_2022_PROGRAM_ID),
  ]);

  const quoteOut = getSellSolAmountFromTokenAmount({
    global,
    feeConfig,
    mintSupply: state.bondingCurve.tokenTotalSupply,
    bondingCurve: state.bondingCurve,
    amount,
  });

  const instructions = await PUMP_SDK.sellV3Instructions({
    bondingCurve: state.bondingCurve,
    mint,
    user: wallet.publicKey,
    amount,
    quoteAmount: quoteOut,
    slippage: 1,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    quoteTokenProgram: state.quoteTokenProgram,
  });

  return sendAndConfirmTransaction(connection, new Transaction().add(...instructions), [wallet]);
}
```

## 4. PumpSwap v2 trades and signed `virtual_quote_reserves`

On PumpSwap, `@pump-fun/pump-swap-sdk` 2.1.0 builds the new trades with `buyV2Instructions`, `buyExactQuoteInV2Instructions` and `sellV2Instructions`. The high-level `buyBaseInput`, `buyQuoteInput`, `sellBaseInput` and `sellQuoteInput` builders take `{ v2: true }` and use v2 wherever `supportsTradeV2(pool)` is true. Prices come from the same quote functions as v1.

If you price pools yourself, the one change that matters is the sign of `virtual_quote_reserves`. The v2 trades keep fees in the quote vault and subtract them from `virtual_quote_reserves`, so the kept fees never count as liquidity. Reading the field as an unsigned integer turns a small negative number into an enormous price. `decodePumpPool` keeps the sign, reads fields missing from older, shorter pools as `0`, and `effectivePoolQuoteReserves` adds the two:

```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import { decodePumpPool, effectivePoolQuoteReserves } from '@pumpkit/core';

export async function poolReserves(connection: Connection, poolAddress: PublicKey) {
  const info = await connection.getAccountInfo(poolAddress);
  const pool = info && decodePumpPool(info.data);
  if (!pool) throw new Error(`${poolAddress.toBase58()} is not a PumpSwap pool`);

  const [base, quote] = await Promise.all([
    connection.getTokenAccountBalance(new PublicKey(pool.poolBaseTokenAccount)),
    connection.getTokenAccountBalance(new PublicKey(pool.poolQuoteTokenAccount)),
  ]);

  return {
    baseReserves: BigInt(base.value.amount),
    quoteReserves: effectivePoolQuoteReserves(BigInt(quote.value.amount), pool.virtualQuoteReserves),
    keptProtocolFees: pool.protocolFees,
    keptCreatorFees: pool.creatorFees,
  };
}
```

Store the field in a signed column in an indexer (`numeric` or `bigint` is fine; never an unsigned type). Liquidity providers on a quiet pool should call the permissionless `extend_account` first: `deposit` and `withdraw` on a pool that has not traded since the upgrade fail until its account grows.

## 5. Multi-hop swaps

`multi_hop_swap` trades through two or more curves and pools in one instruction. It is built for coins paired with another pump coin: to buy coin B paired with pump coin A, which is paired with SOL, the route is SOL to A to B, and A never touches your wallet.

```typescript
import { Connection, Keypair, PublicKey, ComputeBudgetProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { NATIVE_MINT } from '@solana/spl-token';
import BN from 'bn.js';
import { OnlinePumpSdk, PUMP_SDK } from '@pump-fun/pump-sdk';

export async function buyThroughQuoteCoin(
  connection: Connection,
  wallet: Keypair,
  quoteCoin: PublicKey,
  coin: PublicKey,
  lamportsIn: BN,
) {
  const online = new OnlinePumpSdk(connection);
  const hops = await online.resolveMultiHopRoute([NATIVE_MINT, quoteCoin, coin], 'buy');
  const expectedOut = await online.simulateMultiHopSwap({
    user: wallet.publicKey,
    hops,
    side: 'buy',
    amountIn: lamportsIn,
  });
  const minAmountOut = expectedOut.muln(99).divn(100);

  const instructions = await PUMP_SDK.multiHopSwapInstructions({
    user: wallet.publicKey,
    hops,
    side: 'buy',
    amountIn: lamportsIn,
    minAmountOut,
  });

  const tx = new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 * hops.length }))
    .add(...instructions);
  return sendAndConfirmTransaction(connection, tx, [wallet]);
}
```

- Every hop must go the same way: all buys or all sells (`MultiHopMixedDirection`, 6086). The hops must chain (`MultiHopDiscontinuousPath`, 6084).
- Pool hops must be canonical pump pools. Mayhem pools (`MayhemPoolNotSupported`, 6080) and mayhem curves (`MultiHopMayhemCurveNotSupported`, 6108) cannot be hops.
- The protocol fee is charged once, on the hop that trades your own currency, and the creator fee once, on the hop that trades the coin at the far end. Middle hops charge nothing.
- Up to three hops fit a legacy transaction. Four or more need a v0 transaction with an address lookup table.
- A bonding curve hop with `ix_name` `multi_hop_swap` can complete its curve like a v3 buy, so indexers must handle a `PostCompleteBuyEvent` after it.

## 6. Coins quoted in a pump coin

`create_v2` can pair a new coin with an existing pump coin (see [Creating a coin paired with a pump coin](../docs/pump-protocol/instructions/CREATE_WITH_PUMP_COIN_QUOTE.md)). On those coins every quote amount (`TradeEvent.sol_amount`, fees, reserves) is in the quote coin's base units, not lamports.

- `TradeEvent.quote_mint` names the quote. The default key `11111111111111111111111111111111` and wrapped SOL both mean SOL. `isSolQuoteMint` from `@pumpkit/core` checks both.
- The PumpKit whale, channel and monitor bots apply their SOL thresholds only to SOL-quoted trades, so a large number of pump-coin units is never reported as a large SOL trade.
- Pump coins used as quote are usually Token-2022. Pass the quote's token program (`fetchBuyState` returns it as `quoteTokenProgram`).

## 7. Claiming creator fees: sweep first

This is the change that breaks claim bots silently. A creator's fee from v3 curve trades and v2 pool trades is **not** in the creator vault until a `sweep_creator_fee` moves it there. `collect_creator_fee` and `collect_coin_creator_fee` only see the vault, so a bot that keeps collecting without sweeping under-pays the creator while every transaction still succeeds.

Put the sweeps first in the same transaction as the collect:

```typescript
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { OnlinePumpSdk } from '@pump-fun/pump-sdk';
import { getCreatorFeeSweepInstructions } from '@pumpkit/core';

export async function claimCreatorFees(connection: Connection, creator: Keypair, mints: PublicKey[]) {
  const tx = new Transaction();
  for (const mint of mints) {
    const sweep = await getCreatorFeeSweepInstructions(connection, mint, creator.publicKey);
    tx.add(...sweep.instructions);
  }
  const collect = await new OnlinePumpSdk(connection).collectCoinCreatorFeeInstructions(creator.publicKey);
  tx.add(...collect);
  return sendAndConfirmTransaction(connection, tx, [creator]);
}
```

`getCreatorFeeSweepInstructions` reads the curve's `creator_fee` and, once the coin has migrated, the canonical pool's `creator_fees`. It returns only the sweeps that have something to move, with the pool sweep paying the pool's own `coin_creator`. `collectCoinCreatorFeeInstructions` collects SOL from both programs; for coins quoted in USDC or a pump coin use `collectCoinCreatorFeeAllQuotesInstructions`.

Some instructions refuse to run while a creator fee is waiting, so the sweep must come first in the same transaction:

| Instruction | Program | Error if not swept |
|-------------|---------|--------------------|
| `distribute_creator_fees`, `distribute_creator_fees_v2`, `admin_cto`, `create_fee_sharing_config` (curve) | Pump | `CreatorFeesNotSwept` (6095) |
| `admin_cto_pool`, `create_fee_sharing_config` (pool) | PumpSwap | `CreatorFeesNotSwept` (6081) |
| `update_fee_shares`, `update_fee_shares_v2` | Pump Fees | `PoolCreatorFeesNotSwept` (6033) |

For fee sharing coins, `OnlinePumpSdk.buildDistributeCreatorFeesInstructions(mint, { payer })` prepends both sweeps for you. Sending the sweeps in an earlier transaction of their own is not safe on an active coin: a v3 trade landing in between refills the bucket and the distribution fails with 6095.

pump.fun runs `sweep_protocol_fee` itself; integrators never need to call it.

## 8. Indexing: trades, synthetic migration and sweeps

The new trades change three things for indexers:

1. **`TradeEvent.fee_recipient` is the zero key** on v3 trades and multi-hop curve hops. It means the protocol fee was kept on the curve. `fee`, `creator_fee` and `buyback_fee` still carry the amounts charged, and `creator_fee_unclaimed` is the creator fee waiting on the curve after the trade.
2. **A curve-completing buy emits `TradeEvent`, `CompleteEvent`, then `PostCompleteBuyEvent`.** The buyer's total is the sum of the `TradeEvent` and the `PostCompleteBuyEvent` amounts.
3. **Payouts appear later as `SweepBondingCurveFeeEvent` (Pump) or `SweepPoolFeeEvent` (PumpSwap)**, with `bucket` `0` for the protocol fee and `1` for the creator fee. Count fee income from trade events and payouts from sweep events, never both as income.

`@pumpkit/core` handles all three. `parsePumpLogEvents` attributes each `Program data:` line to the program that emitted it (a PumpSwap `BuyEvent` is never decoded as a Pump event, even inside a multi-hop transaction), and `aggregateTrades` folds each `PostCompleteBuyEvent` into the buy it continues:

```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import {
  PUMP_PROGRAM_ID, aggregateTrades, isSolQuoteMint, parsePumpLogEvents,
} from '@pumpkit/core';

const connection = new Connection(process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com');

connection.onLogs(new PublicKey(PUMP_PROGRAM_ID), ({ logs, signature, err }) => {
  if (err) return;
  const events = parsePumpLogEvents(logs);

  for (const trade of aggregateTrades(events)) {
    const unit = isSolQuoteMint(trade.quoteMint) ? 'lamports' : `units of ${trade.quoteMint}`;
    console.log(signature, trade.ixName, trade.isBuy ? 'buy' : 'sell', trade.solAmount.toString(), unit, {
      feeKeptOnCurve: trade.feeKeptOnCurve,
      creatorFeeUnclaimed: trade.creatorFeeUnclaimed?.toString(),
      syntheticMigration: trade.syntheticMigration,
    });
  }

  for (const event of events) {
    if (event.type === 'sweep') {
      console.log(signature, `${event.data.bucket} fee paid out`, event.data.amount.toString(), 'to', event.data.recipient);
    }
  }
});
```

The decoders are length-tolerant: older, shorter events decode with the newer fields set to `null`, and events that grow new trailing fields keep decoding.

## Upgrade checklist

- [ ] Bump `@pump-fun/pump-sdk` to `^4.0.0` (and `@pump-fun/pump-swap-sdk` to `^2.1.0` if you use it directly).
- [ ] Build curve trades with the v3 builders, falling back to v2 for cashback coins.
- [ ] Build pool trades with v2 (`{ v2: true }`), falling back to v1 for cashback pools (`supportsTradeV2(pool)`).
- [ ] Read `Pool.virtual_quote_reserves` as a signed `i128`; a missing field is `0`.
- [ ] Put `sweep_creator_fee` (curve, and pool once migrated) before every collect, distribute, CTO and fee share update.
- [ ] Sum `TradeEvent` and `PostCompleteBuyEvent` for a buyer's total; never assume `TradeEvent.sol_amount` is lamports.
- [ ] Count fee income from trade events and payouts from sweep events.

## See also

- [Bonding curve trades v3](../docs/pump-protocol/instructions/TRADE_V3.md), [PumpSwap trades v2](../docs/pump-protocol/instructions/PUMP_SWAP_TRADE_V2.md), [Multi-hop swap](../docs/pump-protocol/instructions/MULTI_HOP_SWAP.md), [Fee sweeps](../docs/pump-protocol/instructions/SWEEP_FEES.md)
- [Synthetic migration](../docs/pump-protocol/SYNTHETIC_MIGRATION.md) and [Negative virtual quote reserves](../docs/pump-protocol/NEGATIVE_VIRTUAL_QUOTE_RESERVES.md)
- [Tutorial 47: V2 Creator Fees](47-v2-creator-fees.md) and [Tutorial 43: Understanding PumpFun Events](43-understanding-pumpfun-events.md)
- [Events reference](../docs/events-reference.md) and [Errors](../docs/errors.md)
