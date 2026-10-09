# Pump Protocol Reference

> Official protocol documentation from [pump-fun/pump-public-docs](https://github.com/pump-fun/pump-public-docs). Read these before building on-chain interactions.

## Three On-Chain Programs

| Program | ID | Purpose |
|---------|-----|---------|
| **Pump** | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` | Bonding curve: create, buy, sell tokens |
| **PumpAMM** | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` | Post-graduation AMM pools: swap, multi-hop, deposit, withdraw |
| **PumpFees** | `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ` | Fee sharing and distribution |

## Documentation Index

### Core

| Doc | Description |
|-----|-------------|
| [OVERVIEW.md](OVERVIEW.md) | Upstream README: October 2026 changes, negative virtual quote reserves, create_v2, mayhem mode, social fees |
| [PUMP_PROGRAM_README.md](PUMP_PROGRAM_README.md) | Bonding curve state, instructions, account types |
| [PUMP_SWAP_README.md](PUMP_SWAP_README.md) | AMM pool state, swap/deposit/withdraw |
| [PUMP_SWAP_SDK_README.md](PUMP_SWAP_SDK_README.md) | PumpSwap SDK method reference |

### Trading (October 2026 upgrade)

| Doc | Description |
|-----|-------------|
| [instructions/TRADE_V3.md](instructions/TRADE_V3.md) | Bonding curve `buy_v3`, `sell_v3`, `buy_exact_quote_in_v3`: 17 accounts, trailing `partial_fill` |
| [instructions/PUMP_SWAP_TRADE_V2.md](instructions/PUMP_SWAP_TRADE_V2.md) | PumpSwap `buy_v2`, `sell_v2`, `buy_exact_quote_in_v2`: 17 accounts |
| [instructions/MULTI_HOP_SWAP.md](instructions/MULTI_HOP_SWAP.md) | `multi_hop_swap`: one instruction through several pools and curves, fees charged once per route |
| [instructions/CREATE_WITH_PUMP_COIN_QUOTE.md](instructions/CREATE_WITH_PUMP_COIN_QUOTE.md) | `create_v2` paired with an existing pump coin as quote mint |
| [SYNTHETIC_MIGRATION.md](SYNTHETIC_MIGRATION.md) | The buy that empties the curve continues at the future pool price (`PostCompleteBuyEvent`) |
| [NEGATIVE_VIRTUAL_QUOTE_RESERVES.md](NEGATIVE_VIRTUAL_QUOTE_RESERVES.md) | `Pool.virtual_quote_reserves` is a signed i128 and can be negative |
| [VIRTUAL_QUOTE_RESERVES_FEE_ADJUSTMENT.md](VIRTUAL_QUOTE_RESERVES_FEE_ADJUSTMENT.md) | Fees kept in a pool are subtracted from `virtual_quote_reserves` |
| [instructions/BUY.md](instructions/BUY.md) / [instructions/SELL.md](instructions/SELL.md) | Legacy `buy` / `sell` account lists (still supported) |
| [instructions/COIN_CREATION.md](instructions/COIN_CREATION.md) | `create_v2` account list |
| [CPI_README.md](CPI_README.md) | Calling Pump and PumpSwap via CPI |

### Fees

| Doc | Description |
|-----|-------------|
| [FEE_PROGRAM_README.md](FEE_PROGRAM_README.md) | Dynamic fee tiers based on market cap |
| [PUMP_CREATOR_FEE_README.md](PUMP_CREATOR_FEE_README.md) | Creator fees on bonding curve |
| [PUMP_SWAP_CREATOR_FEE_README.md](PUMP_SWAP_CREATOR_FEE_README.md) | Creator fees on AMM pools |
| [instructions/SWEEP_FEES.md](instructions/SWEEP_FEES.md) | `sweep_protocol_fee` / `sweep_creator_fee`: v3/v2 trades keep fees on the curve or pool; sweep the creator fee before collecting |
| [instructions/COLLECT_CREATOR_FEE.md](instructions/COLLECT_CREATOR_FEE.md) | Collecting creator fees |
| [instructions/CREATOR_FEE_SHARING.md](instructions/CREATOR_FEE_SHARING.md) | Creator fee sharing configs and distribution |
| [FEE_RECIPIENTS.md](FEE_RECIPIENTS.md) / [BREAKING_FEE_RECIPIENT.md](BREAKING_FEE_RECIPIENT.md) | Fee recipient lists |
| [HOLDER_REWARDS_README.md](HOLDER_REWARDS_README.md) | Holder rewards coins |
| [PUMP_CASHBACK_README.md](PUMP_CASHBACK_README.md) | Cashback rewards and UserVolumeAccumulator (deprecated; v3/v2 trades reject cashback coins) |
| [instructions/CLAIM_CASHBACK.md](instructions/CLAIM_CASHBACK.md) | `claim_cashback` for existing cashback coins |

### Reference

| Doc | Description |
|-----|-------------|
| [FAQ.md](FAQ.md) | CU optimization tips, PDA bump effects |
| [idl/](idl/) | Official Anchor IDL files (pump.json, pump_amm.json, pump_fees.json) |
