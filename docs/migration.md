# Migration Guide

> How to upgrade between versions of `@nirholas/pump-sdk`. Each section covers breaking changes, new features, and the steps to migrate.

---

## October 2026 Pump / PumpSwap upgrade (`@pump-fun/pump-sdk` 4.0.0)

> A program upgrade, not a `@nirholas/pump-sdk` release: the fork has no October 2026
> version, so the new instructions come from the official `@pump-fun/pump-sdk` 4.0.0 and
> `@pump-fun/pump-swap-sdk` 2.1.0. `@pumpkit/core` takes `@pump-fun/pump-sdk` `^4.0.0` as an
> optional peer dependency for its v3 quotes and creator fee sweeps; everything else keeps
> working on `@nirholas/pump-sdk` 2. Walkthrough: [tutorial 55](../tutorials/55-october-2026-trade-upgrade.md).
> Upstream specs: [docs/pump-protocol/](pump-protocol/).

### What changed on chain

| Change | What to do |
|--------|-----------|
| New curve trades `buy_v3`, `sell_v3`, `buy_exact_quote_in_v3` keep the protocol and creator fee on the curve (`BondingCurve.protocolFees` / `creatorFee`). Their `TradeEvent.feeRecipient` is the zero key | Indexers: count `fee` / `creatorFee` from the event, not from a fee recipient balance change. Use `ixName` to tell versions apart. Cashback coins cannot use v3 (6094); keep the legacy instructions for them |
| New PumpSwap trades `buy_v2`, `sell_v2`, `buy_exact_quote_in_v2` keep fees in the pool (`Pool.protocolFees` / `creatorFees`) | Liquidity is the quote vault minus both buckets. Cashback pools stay on v1 (6079); mayhem pools work with v2 |
| `Pool.virtual_quote_reserves` is a signed `i128` | Price against `vault + virtualQuoteReserves` (`effectivePoolQuoteReserves`); payouts are capped by the vault (6063) |
| Permissionless `sweep_protocol_fee` / `sweep_creator_fee` on Pump and PumpSwap | Put `sweep_creator_fee` in front of every creator fee collect (`getCreatorFeeSweepInstructions`). Distribution, CTO and share updates refuse to run while a creator bucket is nonzero (6095 Pump, 6081 PumpSwap, 6033 PumpFees). A sweep with nothing waiting is a no-op |
| A `buy_v3` past the remaining supply completes the curve and fills the rest against the canonical pool (synthetic migration) | The logs carry `TradeEvent`, `CompleteEvent`, `PostCompleteBuyEvent`; the buyer's total is both legs (`aggregateTrades`) |
| `multi_hop_swap` routes through curves and pools in one instruction | Each curve hop emits its own `TradeEvent` |
| Coins can be quoted in another pump coin (`CREATE_WITH_PUMP_COIN_QUOTE`) | Resolve the quote with `OnlinePumpSdk.resolveQuoteMint(mint)`; amounts are in that coin's base units. New errors 6105 (`CurveDepthExceeded`) and 6107 (`QuoteCurveAwaitingMigration`) |

### New PumpKit exports

- Decoders: `parsePumpLogEvents`, `aggregateTrades`, `decodeTradeEvent`, `decodePostCompleteBuyEvent`, `decodeCompleteEvent`, `decodeSweepBondingCurveFeeEvent`, `decodeSweepPoolFeeEvent`, `decodePumpPool`, `effectivePoolQuoteReserves`
- SDK bridge: `getBuyV3Quote`, `getBuyV3Cost`, `getCreatorFeeSweepInstructions`
- Constants: the v3 / v2 / multi-hop / sweep discriminators, `FEE_KEPT_ON_CURVE_RECIPIENT`, `SWEEP_FEE_BUCKET`, `PUMP_ERROR_CODES`, `PUMP_AMM_ERROR_CODES`, `PUMP_FEES_ERROR_CODES`

See [core-api.md](core-api.md#parsepumplogeventslogs-pumplogevent).

### Migration steps

```bash
npm install @pump-fun/pump-sdk@^4.0.0
```

1. Monitors and indexers: decode with `parsePumpLogEvents` + `aggregateTrades` so v3 trades and synthetic migration buys report full amounts.
2. Fee claimers: prepend `getCreatorFeeSweepInstructions(...).instructions` to the collect transaction.
3. Pool readers: use `decodePumpPool` and `effectivePoolQuoteReserves` instead of the raw vault balance.

---

## Upgrading to v2.0.0 (Latest)

> Released: 2026-09-18. Tracks the Pump program's 2.0 upgrade. PumpKit's `@pumpkit/core`
> and `@pumpkit/channel` pin `@nirholas/pump-sdk` `^2.0.0`.

### Breaking Changes

| Change | What to do |
|--------|-----------|
| Cashback launches: `createV2Instruction` / `createV2AndBuyInstructions` with `cashback: true` throw `CashbackDeprecatedError` (the program rejects them with 6082) | Launch with `holderReward: true` instead. Trading and claims on existing cashback coins are unchanged. |
| `holderReward: true` launches route the creator to `holderRewardsPda(mint)` and need `Global.isHolderRewardEnabled` (6084 otherwise, `HolderRewardDisabledError` locally) | Read `fetchGlobal()` first and show a clear message when the gate is off. |
| `adminSetCreatorInstruction` throws (the program retired `admin_set_creator`) | Use `adminCtoInstruction`. |
| `BondingCurve.virtualSolReserves` / `realSolReserves` are now `virtualQuoteReserves` / `realQuoteReserves` (same bytes; a curve can be quoted in USDC) | Rename every read of a fetched or decoded `BondingCurve`. The old names read `undefined` with no type error in plain JS. `bondingCurveMarketCap` and `computeFeesBps` take `virtualQuoteReserves`. |

What did **not** change in the fork: `TradeEvent` and `CreateEvent` keep `virtualSolReserves` /
`realSolReserves`, and `isCreatorUsingSharingConfig` keeps its name (upstream
`@pump-fun/pump-sdk` 2 renamed it to `hasCoinCreatorMigratedToSharingConfig`; the
`@nirholas` fork did not).

### New Features

- `holderRewardsPda`, `adminCtoInstruction`, `distributeFeeToHoldersInstruction`
- New events: `AdminCtoEvent`, `DistributeFeeToHoldersEvent` (also returned by `parsePumpEventsFromLogs`)
- `CreateEvent.isHolderReward`, `TradeEvent.holderRewards` / `holderRewardsBps`, `BondingCurve.isHolderReward` / `quoteMint` / `creatorFeeBps`
- IDL synced to the deployed 47-instruction program; `@pump-fun/pump-swap-sdk` 1.20

### Decoding events

The `PUMP_SDK.decode*Event` helpers decode the bare Borsh payload. Strip the 8-byte
event discriminator first, or use `parsePumpEventsFromLogs(logs)`, which also picks the
right IDL for the program that emitted each `Program data:` line:

```typescript
import { parsePumpEventsFromLogs } from '@nirholas/pump-sdk';

for (const ev of parsePumpEventsFromLogs(tx.meta.logMessages ?? [])) {
  if (ev.type === 'create') console.log(ev.data.symbol, 'holder rewards:', ev.data.isHolderReward);
  if (ev.type === 'distributeFeeToHolders') console.log('paid', ev.data.recipients.toString(), 'holders');
}
```

---

## Upgrading to v1.29.0

> Released: 2026-03-06

### Breaking Changes

**All buy/sell instructions now require additional V2 PDAs.**

The on-chain Pump program was upgraded to require `bonding_curve_v2` and `pool_v2` accounts on all buy and sell instructions. The SDK handles this automatically — just upgrade and rebuild.

```bash
npm install @nirholas/pump-sdk@latest
```

If you're building instructions manually (not using the SDK), you must now include:

| Instruction | New Required Account | Derivation |
|------------|---------------------|-----------|
| Bonding curve `buy` | `bonding_curve_v2` (readonly) | `bondingCurveV2Pda(mint)` — seeds: `["bonding-curve-v2", mint]` |
| Bonding curve `buyExactSolIn` | `bonding_curve_v2` (readonly) | Same |
| Bonding curve `sell` | `bonding_curve_v2` (readonly) | Same (after optional `user_volume_accumulator`) |
| PumpAMM `buy` | `pool_v2` (readonly) | `poolV2Pda(baseMint)` — seeds: `["pool-v2", base_mint]` |
| PumpAMM `buyExactQuoteIn` | `pool_v2` (readonly) | Same |
| PumpAMM `sell` | `pool_v2` (readonly) | Same |

For cashback coins on PumpAMM, `user_volume_accumulator_wsol_ata` is also prepended as a mutable account.

### New Features

- `bondingCurveV2Pda(mint)` — derive the V2 bonding curve PDA
- `poolV2Pda(baseMint)` — derive the V2 pool PDA
- AMM buy/sell instructions now accept optional `cashback` parameter

### Migration Steps

1. Update the package:
   ```bash
   npm install @nirholas/pump-sdk@latest
   ```
2. Rebuild your project — no code changes needed if you use the SDK's instruction builders
3. If you construct instruction accounts manually, add the V2 PDA accounts listed above
4. Test on devnet before deploying to mainnet

---

## Upgrading to v1.28.0

> Released: 2026-02-26

### What's New

This was a massive feature release. No breaking changes to the core SDK API, but many new modules were added.

**Safe to upgrade:**

```bash
npm install @nirholas/pump-sdk@1.28.0
```

### New SDK Exports

| Export | Description |
|--------|-------------|
| `calculateBuyPriceImpact()` | Price impact analysis for buys |
| `calculateSellPriceImpact()` | Price impact analysis for sells |
| `getGraduationProgress()` | Bonding curve graduation progress (0-100%) |
| `getTokenPrice()` | Current buy/sell price and market cap |
| `getBondingCurveSummary()` | Full bonding curve snapshot |
| `createSocialFeePdaInstruction()` | Create a social fee PDA (platform-based fees) |
| `claimSocialFeePdaInstruction()` | Claim from a social fee PDA |
| `SocialFeePdaCreatedEvent` | Event type for social fee creation |
| `SocialFeePdaClaimedEvent` | Event type for social fee claims |
| `AmmBuyEvent` / `AmmSellEvent` | AMM trade event types |
| `DepositEvent` / `WithdrawEvent` | AMM LP event types |
| `CreatePoolEvent` | AMM pool creation event |
| Fee sharing events | `CreateFeeSharingConfigEvent`, `UpdateFeeSharesEvent`, etc. |

### New Ecosystem Components Added

- **19 tutorials** (`tutorials/`) — beginner to advanced
- **Analytics module** (`src/analytics.ts`) — price impact, graduation, pricing
- **WebSocket relay server** (`websocket-server/`) — real-time token launch broadcasting
- **Live dashboards** (`live/`) — browser-based monitoring UIs
- **x402 payment protocol** (`x402/`) — HTTP 402 micropayments
- **Telegram bot REST API** — full CRUD with auth, rate limiting, SSE, webhooks
- **Expanded Telegram bot** — graduation, whale, fee distribution alerts, CTO detection
- **Channel bot** (`channel-bot/`) — read-only Telegram channel feed
- **DeFi agents** (`packages/defi-agents/`) — 43 AI agent definitions
- **28 agent skill documents** (`skills/`)

---

## Upgrading from v1.0.0 to v1.27.x

### Breaking: `createInstruction` → `createV2Instruction`

`createInstruction` (v1) is deprecated. Use `createV2Instruction` instead:

```typescript
// Before (deprecated — will be removed in v2.0)
const ix = await PUMP_SDK.createInstruction({ mint, name, symbol, uri, creator, user });

// After
const ix = await PUMP_SDK.createV2Instruction({
  mint, name, symbol, uri, creator, user,
  mayhemMode: false,  // NEW — required parameter
  holderReward: false, // pump-sdk 2: true routes creator fees to holders
});
```

> **pump-sdk 2:** `cashback: true` now throws `CashbackDeprecatedError` (the program
> rejects cashback launches with 6082). Use `holderReward: true` instead, which needs
> `Global.isHolderRewardEnabled` (6084 otherwise). See the v2.0.0 section above.

### Breaking: Fee Calculation Signature Change

Fee functions now accept a `feeConfig` parameter for tiered fee support:

```typescript
// Before (v1.0.0)
const tokens = getBuyTokenAmountFromSolAmount(global, bondingCurve, solAmount);

// After (v1.27+)
const feeConfig = await sdk.fetchFeeConfig(); // Fetch once, reuse

const tokens = getBuyTokenAmountFromSolAmount({
  global,
  feeConfig,        // NEW — fetch with sdk.fetchFeeConfig()
  mintSupply,        // NEW — bondingCurve.tokenTotalSupply or null for new curves
  bondingCurve,
  amount: solAmount,
});
```

The same change applies to `getSellSolAmountFromTokenAmount` and `getBuySolAmountFromTokenAmount`.

### New Exports (v1.27+)

| Export | Description |
|--------|-------------|
| `isCreatorUsingSharingConfig()` | Check if a creator has fee sharing configured |
| `MinimumDistributableFeeResult` | Return type for fee distribution checks |
| `DistributeCreatorFeeResult` | Return type for fee distribution execution |
| `MAYHEM_PROGRAM_ID` | Mayhem program address |
| `computeFeesBps()` | Compute fees in basis points for a given tier |
| `calculateFeeTier()` | Determine the fee tier from token supply |
| `NoShareholdersError` | Error: no shareholders configured |
| `TooManyShareholdersError` | Error: exceeded max 10 shareholders |
| `ZeroShareError` | Error: shareholder has 0 BPS share |
| `InvalidShareTotalError` | Error: shares don't total 10,000 BPS |
| `DuplicateShareholderError` | Error: same address appears twice |

---

## Version Summary

| Version | Date | Type | Key Changes |
|---------|------|------|-------------|
| Program upgrade | 2026-10 | **Behavior** | v3 curve trades and v2 pool trades keep fees until swept, synthetic migration, multi-hop swaps, pump-coin quotes (`@pump-fun/pump-sdk` 4.0.0) |
| v2.0.0 | 2026-09-18 | **Breaking** | Cashback launches rejected, holder-reward launches, `adminCtoInstruction`, `*QuoteReserves` on `BondingCurve` |
| v1.29.0 | 2026-03-06 | **Breaking** | V2 PDAs required on all buy/sell (SDK handles automatically) |
| v1.28.0 | 2026-02-26 | Feature | Analytics, tutorials, bots, dashboards, x402, social fees |
| v1.27.x | — | **Breaking** | `createInstruction` → `createV2Instruction`, fee config parameter |
| v1.0.0 | 2026-02-11 | Initial | Core SDK, bonding curve, fees, vanity generators, MCP server |

---

## General Upgrade Steps

1. **Read the [CHANGELOG](../CHANGELOG.md)** for the full list of changes
2. **Update the package:**
   ```bash
   npm install @nirholas/pump-sdk@<version>
   ```
3. **Run TypeScript compilation** to catch type errors:
   ```bash
   npx tsc --noEmit
   ```
4. **Run your tests** to verify behavior hasn't changed
5. **Test on devnet** before deploying to mainnet

---

## Getting Help

If you run into issues during migration:

1. Check [Troubleshooting](troubleshooting.md)
2. Search [issues](https://github.com/nirholas/pump-fun-sdk/issues) for your error
3. Open a [new issue](https://github.com/nirholas/pump-fun-sdk/issues/new?template=bug_report.md) with your migration context
