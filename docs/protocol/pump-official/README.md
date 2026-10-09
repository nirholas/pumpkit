# Official PumpFun Protocol Documentation

> Source: [pump-fun/pump-public-docs](https://github.com/pump-fun/pump-public-docs)

These are the **canonical** protocol specifications from the PumpFun team. Always consult the relevant file before modifying on-chain interaction code.

## Document Index

| Document | Topic | When to Read |
|----------|-------|-------------|
| [OVERVIEW.md](OVERVIEW.md) | Upstream README: October 2026 changes (v3/v2 trades, multi-hop, pump-coin quotes, fee sweeps, synthetic migration), negative virtual quote reserves, create_v2, mayhem mode, social fees | Start here for any protocol-level change |
| [PUMP_PROGRAM_README.md](PUMP_PROGRAM_README.md) | Pump bonding curve program: Global/BondingCurve state, all instructions | Building/modifying buy, sell, create, migrate, extend_account instructions |
| [PUMP_SWAP_README.md](PUMP_SWAP_README.md) | PumpSwap AMM program: GlobalConfig/Pool state, swap/deposit/withdraw | Working with graduated tokens, AMM pools, LP operations |
| [PUMP_SWAP_SDK_README.md](PUMP_SWAP_SDK_README.md) | PumpSwap SDK method mapping to Anchor instructions + autocomplete helpers | SDK integration, UI autocomplete, understanding method naming |
| [FEE_PROGRAM_README.md](FEE_PROGRAM_README.md) | Dynamic fee tiers: market cap thresholds, computeFeesBps, calculateFeeTier | Fee calculation logic, tier breakpoints, slippage adjustments |
| [PUMP_CREATOR_FEE_README.md](PUMP_CREATOR_FEE_README.md) | Creator fees on bonding curve: creator_vault PDA, BondingCurve::creator | collect_creator_fee, set_creator, set_metaplex_creator |
| [PUMP_SWAP_CREATOR_FEE_README.md](PUMP_SWAP_CREATOR_FEE_README.md) | Creator fees on AMM pools: coin_creator_vault_authority, canonical pools | collect_coin_creator_fee, Pool::coin_creator, pool extension |
| [PUMP_CASHBACK_README.md](PUMP_CASHBACK_README.md) | Cashback rewards: UserVolumeAccumulator PDA, claim instructions | Cashback-enabled coins, claim_cashback, reading unclaimed amounts |
| [instructions/TRADE_V3.md](instructions/TRADE_V3.md) | Bonding curve `buy_v3`, `sell_v3`, `buy_exact_quote_in_v3` (17 accounts, `partial_fill`) | New bonding curve trade builders |
| [instructions/PUMP_SWAP_TRADE_V2.md](instructions/PUMP_SWAP_TRADE_V2.md) | PumpSwap `buy_v2`, `sell_v2`, `buy_exact_quote_in_v2` (17 accounts) | New AMM trade builders |
| [instructions/MULTI_HOP_SWAP.md](instructions/MULTI_HOP_SWAP.md) | `multi_hop_swap` through pools and curves in one instruction | Routing coin to coin, or across a pump-coin quote |
| [instructions/CREATE_WITH_PUMP_COIN_QUOTE.md](instructions/CREATE_WITH_PUMP_COIN_QUOTE.md) | `create_v2` paired with an existing pump coin as the quote mint | Launching on a pump-coin pair |
| [instructions/SWEEP_FEES.md](instructions/SWEEP_FEES.md) | `sweep_protocol_fee` / `sweep_creator_fee` on the curve and pool | Claiming creator fees after v3/v2 trades (sweep first) |
| [VIRTUAL_QUOTE_RESERVES_FEE_ADJUSTMENT.md](VIRTUAL_QUOTE_RESERVES_FEE_ADJUSTMENT.md) | Why kept fees are subtracted from `virtual_quote_reserves` | Pool quoting |
| [NEGATIVE_VIRTUAL_QUOTE_RESERVES.md](NEGATIVE_VIRTUAL_QUOTE_RESERVES.md) | `Pool.virtual_quote_reserves` is a signed i128 and can be negative | Any code that reads pool reserves |
| [SYNTHETIC_MIGRATION.md](SYNTHETIC_MIGRATION.md) | The buy that empties the curve continues at the future pool price; `PostCompleteBuyEvent` | Quoting the last buy, indexing graduation |
| [HOLDER_REWARDS_README.md](HOLDER_REWARDS_README.md) | Holder rewards coins | Coins whose creator fee goes to holders |
| [FEE_RECIPIENTS.md](FEE_RECIPIENTS.md) / [BREAKING_FEE_RECIPIENT.md](BREAKING_FEE_RECIPIENT.md) | Fee recipient lists and the fee recipient change | Legacy buy/sell account lists |
| [CPI_README.md](CPI_README.md) | Calling Pump and PumpSwap via CPI | On-chain integrations |
| [instructions/](instructions/) | BUY, SELL, COIN_CREATION, CLAIM_CASHBACK, COLLECT_CREATOR_FEE, CREATOR_FEE_SHARING | Per-instruction account lists |
| [FAQ.md](FAQ.md) | CU optimization, PDA bump seed effects on compute | Performance tuning, compute unit limits, simulation tips |

## Quick Lookup by Task

| Task | Read |
|------|------|
| Create a new token | OVERVIEW.md (create_v2), PUMP_PROGRAM_README.md |
| Buy/sell on bonding curve | instructions/TRADE_V3.md, PUMP_PROGRAM_README.md, SYNTHETIC_MIGRATION.md |
| Trade on AMM (graduated token) | instructions/PUMP_SWAP_TRADE_V2.md, PUMP_SWAP_README.md, NEGATIVE_VIRTUAL_QUOTE_RESERVES.md |
| Swap coin to coin in one instruction | instructions/MULTI_HOP_SWAP.md |
| Pair a new coin with a pump coin | instructions/CREATE_WITH_PUMP_COIN_QUOTE.md |
| Calculate fees | FEE_PROGRAM_README.md |
| Collect creator fees | instructions/SWEEP_FEES.md (sweep first), instructions/COLLECT_CREATOR_FEE.md |
| Set up fee sharing | OVERVIEW.md (social fees section) |
| Handle mayhem mode | OVERVIEW.md (mayhem section) |
| Cashback-enabled coins (deprecated; v3/v2 trades reject them) | PUMP_CASHBACK_README.md |
| Optimize compute units | FAQ.md |
| Migrate bonding curve to AMM | PUMP_PROGRAM_README.md (migrate instruction) |
| Add liquidity to AMM pool | PUMP_SWAP_README.md (deposit instruction) |

## IDL Files

The idl/ subdirectory contains the official Anchor IDL files (JSON + TypeScript) for all three programs, synced with upstream for the October 2026 upgrade (pump-sdk 4.0.0, pump-swap-sdk 2.1.0, pump-rust-client 0.4.0):
- pump.json / pump.ts: Pump bonding curve program (6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P)
- pump_amm.json / pump_amm.ts: PumpSwap AMM program (pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA)
- pump_fees.json / pump_fees.ts: Pump fees program (pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ)

> Note: The SDK's working IDLs are in src/idl/ and may contain additional fields beyond the official ones.

The [docs/](docs/) subdirectory is a copy of the upstream `docs/` folder (same relative layout, so its `../idl` links resolve here).
