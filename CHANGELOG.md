# Changelog

All notable changes to PumpKit will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **October 2026 Pump / PumpSwap upgrade.** `@pumpkit/core` takes the official `@pump-fun/pump-sdk` `^4.0.0` as an optional peer dependency (and `@pumpkit/channel` as a dependency) for the new instructions. The monitor and channel bots decode v3 curve trades, PumpSwap v2 trades, multi-hop hops and synthetic migration buys, reporting a buy that completed the curve as one trade with both legs summed. `WhaleMonitor` decodes each trade's real mint, trader and amounts (it used to emit empty events matched on instruction log text, which missed the v3 instruction names) and applies its SOL threshold to SOL-quoted curves. The web launch page builds `createV2` with the resolved quote mint (SOL, USDC or a pump coin). Docs and tutorials cover v3 / v2 trades, fee sweeps, synthetic migration, multi-hop swaps, pump-coin quotes and the signed `Pool.virtual_quote_reserves`, and the mirrored protocol specs and IDLs are synced with upstream. See [tutorial 55](tutorials/55-october-2026-trade-upgrade.md) and [docs/migration.md](docs/migration.md).
- **`@nirholas/pump-sdk` 2.0.** `@pumpkit/core` (peer dependency) and `@pumpkit/channel` now require `^2.0.0`, which tracks the Pump program's 2.0 upgrade. `getBondingCurveState` reads the renamed `virtualQuoteReserves` / `realQuoteReserves` and now also returns `quoteMint`, `isCashbackCoin`, `isHolderReward`, and `creatorFeeBps`; the old `virtualSolReserves` / `realSolReserves` keys stay as deprecated aliases with the same value. Docs, tutorials, and the web SDK page launch with `holderReward` instead of cashback, since new cashback launches now throw `CashbackDeprecatedError`. See [docs/migration.md](docs/migration.md).
- **Channel feed shows holder rewards.** Launch posts flag holder-reward coins, and whale posts show the holders' share of a trade's fees.

### Fixed

- **Mayhem fee tiers in the SDK bridge.** `getBuyQuote`, `getSellQuote` and `getTokenPrice` computed fee tiers from `tokenTotalSupply - virtualTokenReserves`. They now use the one-billion supply the program prices every non-mayhem curve at, and the live mint supply on mayhem curves.
- **Live dashboards decode by event discriminator.** `live/trades.html` classified trades by `Instruction: Buy` / `Sell` log text and read every `Program data:` line as a TradeEvent, so the CompleteEvent and PostCompleteBuyEvent after a curve-completing buy overwrote the trade, and multi-hop curve hops were missed. `live/index.html` read the TradeEvent of a create-and-buy as launch data and priced USDC and pump-coin quoted launches as SOL. Both now match on the 8-byte event discriminators (checked against live mainnet transactions).
- **Docs used a `decodePumpLogs` export that does not exist** and called `onLogs` on the `RpcFallback` returned by `createRpcConnection`. The README, `docs/core-api.md` and `docs/architecture.md` now use `parsePumpLogEvents` and `rpc.getConnection()`.
- **Channel event decoding.** The channel's event monitor passed the full `Program data:` bytes, discriminator included, to the SDK's `decode*Event` helpers, which read a bare payload, so every trade decode threw, and launches were matched against instruction discriminators instead of the `CreateEvent` one. It now uses the SDK's program-aware `parsePumpEventsFromLogs`. Replaying live mainnet logs: 20 of 20 launches, 19 of 19 trades, and a graduation decode, where the old code produced none. The claim monitor strips the discriminator before decoding fee, cashback, and social-fee claim events.

- **Pump program upgrade (April 28 2025)** — Added 8 new fee recipient addresses from the breaking pump program upgrade. `PUMP_FEE_RECIPIENTS` and `PUMP_FEE_RECIPIENT_SET` are now exported from `@pumpkit/core`, `claim`, and `channel` packages. The claim monitor detects fee balance changes across all recipients, and protocol-account filtering in the monitor is updated accordingly.

### Added

- **Event decoders in `@pumpkit/core`:** `parsePumpLogEvents`, `aggregateTrades`, `decodeTradeEvent`, `decodePostCompleteBuyEvent`, `decodeCompleteEvent`, `decodeSweepBondingCurveFeeEvent`, `decodeSweepPoolFeeEvent`, `decodePumpPool`, `effectivePoolQuoteReserves`, plus the v3 / v2 / multi-hop / sweep discriminators and the new error codes. Dependency-free.
- **SDK bridge:** `getBuyV3Quote`, `getBuyV3Cost` and `getCreatorFeeSweepInstructions`.
- **Monorepo setup** — Turborepo with `packages/*` workspaces
- **`@pumpkit/monitor`** — All-in-one PumpFun monitoring bot
  - Fee claim alerts with wallet tracking
  - Token launch detection
  - Graduation alerts (bonding curve → AMM)
  - Whale trade alerts (configurable threshold)
  - CTO (Creator Takeover) detection
  - Fee distribution notifications
  - REST API with SSE streaming
  - Multiple RPC URL failover
- **`@pumpkit/tracker`** — Group call-tracking bot
  - Auto and button call modes
  - 4 leaderboards: calls × performance, each with 24h/7d/30d/all timeframes
  - Canvas-rendered PNL cards (800×450 PNG)
  - Points system (-1 to +5) with 5 ranks (Amateur → Oracle)
  - Win rate tracking and hardcore mode
  - Multi-chain support: Solana, Ethereum, Base, BSC
  - SQLite persistence via better-sqlite3
- **`@pumpkit/channel`** — Read-only Telegram channel feed
  - 5 independent feed toggles (claims, launches, graduations, whales, distributions)
  - HTML messages with Solscan/pump.fun links
- **`@pumpkit/claim`** — Fee claim tracker
  - Track tokens by contract address or X handle
  - Twitter follower display
  - 6 claim instruction types monitored
- **Documentation** — 19 docs covering architecture, deployment, API reference, protocols
- **Tutorials** — 22 hands-on guides from token creation to security auditing
- **Examples** — Live HTML dashboards (token launches, trades, vanity generator)
- **Official Pump protocol docs** — Bundled reference for bonding curve, AMM, fees, cashback
- **Docker support** — Multi-stage Dockerfiles for monitor, tracker, channel, claim
- **Railway deployment configs** — `railway.json` per package
