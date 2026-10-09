# Events Reference

Complete catalog of all events emitted by the Pump, PumpAMM, and PumpFees programs. Events are emitted as Anchor program logs and can be decoded with the SDK.

---

## Decoding Events

All events are decoded from transaction log buffers:

```typescript
import { PUMP_SDK } from "@nirholas/pump-sdk";

// Parse transaction logs to extract event data buffers, then:
const tradeEvent = PUMP_SDK.decodeTradeEvent(data);
const createEvent = PUMP_SDK.decodeCreateEvent(data);
```

`@pumpkit/core` ships dependency-free decoders for the events that changed in the October 2026 upgrade, plus a log parser that keeps track of which program emitted each `Program data:` line (Pump and PumpSwap reuse event names):

```typescript
import { parsePumpLogEvents, aggregateTrades } from "@pumpkit/core";

const events = parsePumpLogEvents(tx.meta.logMessages);  // trade | postCompleteBuy | complete | sweep
const trades = aggregateTrades(events);                  // a synthetic migration buy folded into one trade
```

Single decoders: `decodeTradeEvent`, `decodePostCompleteBuyEvent`, `decodeCompleteEvent`, `decodeSweepBondingCurveFeeEvent`, `decodeSweepPoolFeeEvent`. Each returns `null` on a different discriminator and reads fields older events lack as zero.

---

## Pump Program Events

### TradeEvent

Emitted on every bonding curve buy/sell.

| Field | Type | Description |
|-------|------|-------------|
| `mint` | `PublicKey` | Token mint |
| `solAmount` | `BN` | SOL involved (lamports) |
| `tokenAmount` | `BN` | Tokens involved |
| `isBuy` | `boolean` | `true` = buy, `false` = sell |
| `user` | `PublicKey` | Trader address |
| `timestamp` | `BN` | Unix timestamp |
| `virtualSolReserves` | `BN` | Virtual SOL reserves after trade |
| `virtualTokenReserves` | `BN` | Virtual token reserves after trade |
| `realSolReserves` | `BN` | Real SOL reserves after trade |
| `realTokenReserves` | `BN` | Real token reserves after trade |
| `feeRecipient` | `PublicKey` | Protocol fee recipient |
| `feeBasisPoints` | `BN` | Protocol fee rate (BPS) |
| `fee` | `BN` | Protocol fee amount |
| `creator` | `PublicKey` | Token creator |
| `creatorFeeBasisPoints` | `BN` | Creator fee rate (BPS) |
| `creatorFee` | `BN` | Creator fee amount |
| `trackVolume` | `boolean` | Whether volume is tracked for incentives |
| `totalUnclaimedTokens` | `BN` | Unclaimed token incentives |
| `totalClaimedTokens` | `BN` | Claimed token incentives |
| `currentSolVolume` | `BN` | Current cumulative volume |
| `lastUpdateTimestamp` | `BN` | Volume tracker last update |
| `ixName` | `string` | Instruction name |
| `mayhemMode` | `boolean` | Whether mayhem mode was active |
| `cashbackFeeBasisPoints` | `BN` | Cashback fee rate (BPS) |
| `cashback` | `BN` | Cashback amount |
| `buybackFeeBasisPoints` | `BN` | Buyback part of the protocol fee (BPS) |
| `buybackFee` | `BN` | Buyback fee, paid in the trade |
| `shareholders` | `Shareholder[]` | Fee sharing shareholders, when the creator is a sharing config |
| `quoteMint` | `PublicKey` | Quote mint (WSOL, USDC or a pump coin) |
| `quoteAmount` | `BN` | Quote amount, in the quote mint's units |
| `virtualQuoteReserves` | `BN` | Virtual quote reserves after trade |
| `realQuoteReserves` | `BN` | Real quote reserves after trade |
| `holderRewardsBps` | `BN` | Holder rewards rate (BPS) |
| `holderRewards` | `BN` | Holder rewards amount |
| `creatorFeeUnclaimed` | `BN` | Creator fee waiting on the curve (`BondingCurve.creator_fee`) after this trade |

**Decoder:** `PUMP_SDK.decodeTradeEvent(data)`

**`buy_v3` / `sell_v3` / `buy_exact_quote_in_v3`** keep the protocol and creator fee on the curve. Their TradeEvent has `feeRecipient` set to the zero key (`11111111111111111111111111111111`, exported as `FEE_KEPT_ON_CURVE_RECIPIENT`), while `fee` and `creatorFee` still report the amounts. Read `ixName` to tell the versions apart, and `creatorFeeUnclaimed` for the running total until the next sweep. See [tutorial 55](../../tutorials/55-october-2026-trade-upgrade.md).

---

### CreateEvent

Emitted when a new token is created via `createV2`.

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Token name |
| `symbol` | `string` | Token symbol |
| `uri` | `string` | Metadata URI |
| `mint` | `PublicKey` | Token mint |
| `bondingCurve` | `PublicKey` | Bonding curve PDA |
| `user` | `PublicKey` | Transaction signer |
| `creator` | `PublicKey` | Token creator |
| `timestamp` | `BN` | Unix timestamp |
| `virtualTokenReserves` | `BN` | Initial virtual token reserves |
| `virtualSolReserves` | `BN` | Initial virtual SOL reserves |
| `realTokenReserves` | `BN` | Initial real token reserves |
| `tokenTotalSupply` | `BN` | Total token supply |
| `tokenProgram` | `PublicKey` | SPL Token program used |
| `isMayhemMode` | `boolean` | Whether mayhem mode was active |
| `isCashbackEnabled` | `boolean` | Whether cashback was enabled |

**Decoder:** `PUMP_SDK.decodeCreateEvent(data)`

---

### CompleteEvent

Emitted when a bonding curve reaches 100% and triggers graduation.

| Field | Type | Description |
|-------|------|-------------|
| `user` | `PublicKey` | User who triggered graduation |
| `mint` | `PublicKey` | Token mint |
| `bondingCurve` | `PublicKey` | Bonding curve PDA |
| `timestamp` | `BN` | Unix timestamp |
| `quoteMint` | `PublicKey` | Quote mint of the curve |

**Decoder:** `PUMP_SDK.decodeCompleteEvent(data)`

---

### PostCompleteBuyEvent

Emitted after `CompleteEvent` when a buy empties the curve and the rest of the order fills against the canonical pool in the same instruction (synthetic migration). The sequence is `TradeEvent` (curve part), `CompleteEvent`, `PostCompleteBuyEvent` (pool part). **The buyer's total is the sum of both events**; `quoteIn` already includes the pool fees.

| Field | Type | Description |
|-------|------|-------------|
| `user` | `PublicKey` | Buyer |
| `mint` | `PublicKey` | Token mint |
| `bondingCurve` | `PublicKey` | Bonding curve PDA |
| `quoteMint` | `PublicKey` | Quote mint |
| `timestamp` | `BN` | Unix timestamp |
| `baseOut` | `BN` | Tokens bought from the pool |
| `quoteIn` | `BN` | Quote paid to the pool, fees included |
| `feeBasisPoints` / `fee` | `BN` | Protocol fee on the pool part |
| `creatorFeeBasisPoints` / `creatorFee` | `BN` | Creator fee on the pool part |
| `buybackFee` | `BN` | Buyback fee on the pool part |
| `poolBaseReservesBefore` / `poolQuoteReservesBefore` | `BN` | Pool reserves before the pool part |
| `poolBaseReservesAfter` / `poolQuoteReservesAfter` | `BN` | Pool reserves after the pool part |

**Decoder:** `PUMP_SDK.decodePostCompleteBuyEvent(data)` (`@pump-fun/pump-sdk` 4.0.0), or `decodePostCompleteBuyEvent` from `@pumpkit/core`. Upstream spec: [SYNTHETIC_MIGRATION.md](https://github.com/pump-fun/pump-public-docs/blob/main/docs/SYNTHETIC_MIGRATION.md).

---

### SweepBondingCurveFeeEvent

Emitted by Pump `sweep_protocol_fee` and `sweep_creator_fee`, which pay out the fees v3 trades kept on the curve.

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | `BN` | Unix timestamp |
| `mint` | `PublicKey` | Token mint |
| `bondingCurve` | `PublicKey` | Bonding curve PDA |
| `quoteMint` | `PublicKey` | Quote mint |
| `recipient` | `PublicKey` | Fee recipient or creator vault |
| `amount` | `BN` | Amount swept |
| `bucket` | `u8` | `0` = protocol fee, `1` = creator fee (`SWEEP_FEE_BUCKET`) |

**Decoder:** `decodeSweepBondingCurveFeeEvent` from `@pumpkit/core`. Upstream spec: [SWEEP_FEES.md](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/SWEEP_FEES.md).

---

### CompletePumpAmmMigrationEvent

Emitted when a graduated token migrates to PumpAMM.

| Field | Type | Description |
|-------|------|-------------|
| `user` | `PublicKey` | Migration initiator |
| `mint` | `PublicKey` | Token mint |
| `mintAmount` | `BN` | Tokens migrated |
| `solAmount` | `BN` | SOL migrated |
| `poolMigrationFee` | `BN` | Migration fee |
| `bondingCurve` | `PublicKey` | Source bonding curve |
| `timestamp` | `BN` | Unix timestamp |
| `pool` | `PublicKey` | Created AMM pool |

**Decoder:** `PUMP_SDK.decodeCompletePumpAmmMigrationEvent(data)`

---

### SetCreatorEvent

Emitted when a bonding curve's creator is set or updated.

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | `BN` | Unix timestamp |
| `mint` | `PublicKey` | Token mint |
| `bondingCurve` | `PublicKey` | Bonding curve PDA |
| `creator` | `PublicKey` | New creator |

**Decoder:** `PUMP_SDK.decodeSetCreatorEvent(data)`

---

### CollectCreatorFeeEvent

Emitted when a creator collects accumulated fees.

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | `BN` | Unix timestamp |
| `creator` | `PublicKey` | Creator address |
| `creatorFee` | `BN` | Amount collected (lamports) |

**Decoder:** `PUMP_SDK.decodeCollectCreatorFeeEvent(data)`

---

### AdminSetCreatorEvent

Emitted when the admin overrides a token's creator.

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | `BN` | Unix timestamp |
| `adminSetCreatorAuthority` | `PublicKey` | Admin authority |
| `mint` | `PublicKey` | Token mint |
| `bondingCurve` | `PublicKey` | Bonding curve PDA |
| `oldCreator` | `PublicKey` | Previous creator |
| `newCreator` | `PublicKey` | New creator |

**Decoder:** `PUMP_SDK.decodeAdminSetCreatorEvent(data)`

---

### MigrateBondingCurveCreatorEvent

Emitted when creator is migrated via fee sharing config.

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | `BN` | Unix timestamp |
| `mint` | `PublicKey` | Token mint |
| `bondingCurve` | `PublicKey` | Bonding curve PDA |
| `sharingConfig` | `PublicKey` | Fee sharing config |
| `oldCreator` | `PublicKey` | Previous creator |
| `newCreator` | `PublicKey` | New creator |

**Decoder:** `PUMP_SDK.decodeMigrateBondingCurveCreatorEvent(data)`

---

### ExtendAccountEvent

Emitted when an account is extended (resized).

| Field | Type | Description |
|-------|------|-------------|
| `account` | `PublicKey` | Extended account |
| `user` | `PublicKey` | User who extended |
| `currentSize` | `BN` | Size before |
| `newSize` | `BN` | Size after |
| `timestamp` | `BN` | Unix timestamp |

**Decoder:** `PUMP_SDK.decodeExtendAccountEvent(data)`

---

## Token Incentive Events

### ClaimTokenIncentivesEvent

| Field | Type | Description |
|-------|------|-------------|
| `user` | `PublicKey` | Claimer |
| `mint` | `PublicKey` | Token mint |
| `amount` | `BN` | Tokens claimed |
| `timestamp` | `BN` | Unix timestamp |
| `totalClaimedTokens` | `BN` | Cumulative claimed |
| `currentSolVolume` | `BN` | Volume at claim time |

**Decoder:** `PUMP_SDK.decodeClaimTokenIncentivesEvent(data)`

---

### ClaimCashbackEvent

| Field | Type | Description |
|-------|------|-------------|
| `user` | `PublicKey` | Claimer |
| `amount` | `BN` | SOL claimed (lamports) |
| `timestamp` | `BN` | Unix timestamp |
| `totalClaimed` | `BN` | Cumulative claimed |
| `totalCashbackEarned` | `BN` | Total earned to date |

**Decoder:** `PUMP_SDK.decodeClaimCashbackEvent(data)`

---

### Volume Accumulator Events

#### InitUserVolumeAccumulatorEvent

| Field | Type | Description |
|-------|------|-------------|
| `payer` | `PublicKey` | Account funder |
| `user` | `PublicKey` | User address |
| `timestamp` | `BN` | Unix timestamp |

#### SyncUserVolumeAccumulatorEvent

| Field | Type | Description |
|-------|------|-------------|
| `user` | `PublicKey` | User address |
| `totalClaimedTokensBefore` | `BN` | Before sync |
| `totalClaimedTokensAfter` | `BN` | After sync |
| `timestamp` | `BN` | Unix timestamp |

#### CloseUserVolumeAccumulatorEvent

| Field | Type | Description |
|-------|------|-------------|
| `user` | `PublicKey` | User address |
| `timestamp` | `BN` | Unix timestamp |
| `totalUnclaimedTokens` | `BN` | Unclaimed at close |
| `totalClaimedTokens` | `BN` | Total claimed |
| `currentSolVolume` | `BN` | Volume at close |
| `lastUpdateTimestamp` | `BN` | Last update |

---

## PumpAMM Events

### AmmBuyEvent

Emitted on AMM pool buys. See [AMM Trading](../amm-trading.md) for key fields.

Fields added for the October 2026 upgrade, on both `BuyEvent` and `SellEvent`:

| Field | Type | Description |
|-------|------|-------------|
| `buybackFeeBasisPoints` / `buybackFee` | `BN` | Buyback part of the protocol fee, paid in the trade |
| `virtualQuoteReserves` | `i128` | Signed virtual quote reserves of the pool after the trade. Price uses `pool_quote_token_reserves + virtualQuoteReserves` |
| `canBoost` | `boolean` | Whether the pool can be boosted |
| `baseSupply` | `BN` | Base mint supply |
| `holderRewardsBps` / `holderRewards` | `BN` | Holder rewards rate and amount |
| `creatorFeeUnclaimed` | `BN` | Creator fee waiting in the pool (`Pool.creator_fees`) after this trade |

`buy_v2` / `sell_v2` / `buy_exact_quote_in_v2` keep the protocol and creator fee in the pool's quote vault, so the recipient token accounts in the event do not receive them in that trade.

**Decoder:** `PUMP_SDK.decodeAmmBuyEvent(data)`

### AmmSellEvent

Emitted on AMM pool sells.

**Decoder:** `PUMP_SDK.decodeAmmSellEvent(data)`

### SweepPoolFeeEvent

Emitted by PumpSwap `sweep_protocol_fee` and `sweep_creator_fee`, which pay out the fees v2 pool trades kept in the quote vault.

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | `BN` | Unix timestamp |
| `pool` | `PublicKey` | Pool |
| `baseMint` / `quoteMint` | `PublicKey` | Pool mints |
| `recipient` | `PublicKey` | Fee recipient or coin creator vault authority |
| `payer` | `PublicKey` | Who paid the rent costs |
| `amount` | `BN` | Amount swept |
| `bucket` | `u8` | `0` = protocol fee, `1` = creator fee |

**Decoder:** `decodeSweepPoolFeeEvent` from `@pumpkit/core`.

### DepositEvent

Emitted on liquidity deposits.

**Decoder:** `PUMP_SDK.decodeDepositEvent(data)`

### WithdrawEvent

Emitted on liquidity withdrawals.

**Decoder:** `PUMP_SDK.decodeWithdrawEvent(data)`

### CreatePoolEvent

Emitted when a new AMM pool is created during graduation.

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | `BN` | Unix timestamp |
| `index` | `number` | Pool index |
| `creator` | `PublicKey` | Pool creator |
| `baseMint` | `PublicKey` | Token mint |
| `quoteMint` | `PublicKey` | SOL mint (wrapped) |
| `baseAmountIn` | `BN` | Initial token amount |
| `quoteAmountIn` | `BN` | Initial SOL amount |
| `pool` | `PublicKey` | Pool address |
| `lpMint` | `PublicKey` | LP token mint |
| `coinCreator` | `PublicKey` | Token creator |
| `isMayhemMode` | `boolean` | Mayhem mode state |

**Decoder:** `PUMP_SDK.decodeCreatePoolEvent(data)`

---

## PumpFees Events

### CreateFeeSharingConfigEvent

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | `BN` | Unix timestamp |
| `mint` | `PublicKey` | Token mint |
| `bondingCurve` | `PublicKey` | Bonding curve |
| `pool` | `PublicKey \| null` | AMM pool (if graduated) |
| `sharingConfig` | `PublicKey` | Config address |
| `admin` | `PublicKey` | Config admin |
| `initialShareholders` | `Shareholder[]` | Initial share split |
| `status` | `number` | Config status |

### UpdateFeeSharesEvent

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | `BN` | Unix timestamp |
| `mint` | `PublicKey` | Token mint |
| `sharingConfig` | `PublicKey` | Config address |
| `admin` | `PublicKey` | Admin who updated |
| `newShareholders` | `Shareholder[]` | Updated shares |

### DistributeCreatorFeesEvent

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | `BN` | Unix timestamp |
| `mint` | `PublicKey` | Token mint |
| `sharingConfig` | `PublicKey` | Config address |
| `admin` | `PublicKey` | Admin |
| `shareholders` | `Shareholder[]` | Recipients |
| `distributed` | `BN` | Total distributed (lamports) |

### ResetFeeSharingConfigEvent

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | `BN` | Unix timestamp |
| `mint` | `PublicKey` | Token mint |
| `sharingConfig` | `PublicKey` | Config address |
| `oldAdmin` | `PublicKey` | Previous admin |
| `oldShareholders` | `Shareholder[]` | Previous shares |
| `newAdmin` | `PublicKey` | New admin |
| `newShareholders` | `Shareholder[]` | New shares |

### RevokeFeeSharingAuthorityEvent

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | `BN` | Unix timestamp |
| `mint` | `PublicKey` | Token mint |
| `sharingConfig` | `PublicKey` | Config address |
| `admin` | `PublicKey` | Authority revoked |

### TransferFeeSharingAuthorityEvent

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | `BN` | Unix timestamp |
| `mint` | `PublicKey` | Token mint |
| `sharingConfig` | `PublicKey` | Config address |
| `oldAdmin` | `PublicKey` | Previous admin |
| `newAdmin` | `PublicKey` | New admin |

### SocialFeePdaCreatedEvent / SocialFeePdaClaimedEvent

See [Social Fees](./social-fees.md).

### MinimumDistributableFeeEvent

| Field | Type | Description |
|-------|------|-------------|
| `minimumRequired` | `BN` | Threshold for distribution |
| `distributableFees` | `BN` | Current distributable amount |
| `canDistribute` | `boolean` | Whether threshold is met |

---

## Related

- [AMM Trading](../amm-trading.md) — AMM event details
- [Fee Sharing](./fee-sharing.md) — Fee distribution system
- [Social Fees](./social-fees.md) — Social fee events
- [Token Incentives](./token-incentives.md) — Volume rewards
- [Tutorial 29](../../tutorials/29-event-parsing-analytics.md) — Event parsing guide
- [Tutorial 55](../../tutorials/55-october-2026-trade-upgrade.md): v3 / v2 trades, sweeps and synthetic migration
