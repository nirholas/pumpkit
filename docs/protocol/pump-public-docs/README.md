# Pump Official Public Documentation

> Mirror of [pump-fun/pump-public-docs](https://github.com/pump-fun/pump-public-docs), the official Pump protocol documentation. Synced for the October 2026 upgrade (`@pump-fun/pump-sdk` 4.0.0, `@pump-fun/pump-swap-sdk` 2.1.0, `pump-rust-client` 0.4.0). IDLs live in [../pump-official/idl](../pump-official/idl).

## Documentation Index

| Document | Description |
|----------|-------------|
| [PUMP_PROGRAM_README.md](PUMP_PROGRAM_README.md) | Pump bonding curve program: state, instructions, fee recipients |
| [PUMP_SWAP_README.md](PUMP_SWAP_README.md) | PumpSwap (Pump AMM) program: constant-product AMM pools |
| [PUMP_SWAP_SDK_README.md](PUMP_SWAP_SDK_README.md) | PumpSwap SDK: create pool, deposit, swap, withdraw |
| [PUMP_CREATOR_FEE_README.md](PUMP_CREATOR_FEE_README.md) | Pump program creator fee update: creator vault, fee calculation |
| [PUMP_SWAP_CREATOR_FEE_README.md](PUMP_SWAP_CREATOR_FEE_README.md) | PumpSwap creator fee update: coin creator vault, fee calculation |
| [FEE_PROGRAM_README.md](FEE_PROGRAM_README.md) | Fee program: tiered fees, fee config, fee sharing |
| [PUMP_CASHBACK_README.md](PUMP_CASHBACK_README.md) | Cashback rewards: user volume accumulator, claim instructions |
| [instructions/TRADE_V3.md](instructions/TRADE_V3.md) | Bonding curve `buy_v3`, `sell_v3`, `buy_exact_quote_in_v3` (17 accounts) |
| [instructions/PUMP_SWAP_TRADE_V2.md](instructions/PUMP_SWAP_TRADE_V2.md) | PumpSwap `buy_v2`, `sell_v2`, `buy_exact_quote_in_v2` (17 accounts) |
| [instructions/MULTI_HOP_SWAP.md](instructions/MULTI_HOP_SWAP.md) | `multi_hop_swap` across pools and bonding curves |
| [instructions/CREATE_WITH_PUMP_COIN_QUOTE.md](instructions/CREATE_WITH_PUMP_COIN_QUOTE.md) | `create_v2` with a pump coin as the quote mint |
| [instructions/SWEEP_FEES.md](instructions/SWEEP_FEES.md) | `sweep_protocol_fee` / `sweep_creator_fee` on the curve and pool |
| [SYNTHETIC_MIGRATION.md](SYNTHETIC_MIGRATION.md) | The last buy on the curve has no max size |
| [NEGATIVE_VIRTUAL_QUOTE_RESERVES.md](NEGATIVE_VIRTUAL_QUOTE_RESERVES.md) | Signed `virtual_quote_reserves` |
| [VIRTUAL_QUOTE_RESERVES_FEE_ADJUSTMENT.md](VIRTUAL_QUOTE_RESERVES_FEE_ADJUSTMENT.md) | Fees kept in a pool and the price |
| [HOLDER_REWARDS_README.md](HOLDER_REWARDS_README.md) | Holder rewards coins |
| [FEE_RECIPIENTS.md](FEE_RECIPIENTS.md) | Fee recipients |
| [BREAKING_FEE_RECIPIENT.md](BREAKING_FEE_RECIPIENT.md) | Fee recipient breaking change |
| [CPI_README.md](CPI_README.md) | CPI guide |
| [instructions/](instructions/) | Per-instruction account lists: BUY, SELL, COIN_CREATION, CLAIM_CASHBACK, COLLECT_CREATOR_FEE, CREATOR_FEE_SHARING |
| [FAQ.md](FAQ.md) | Frequently asked questions: CU optimization, fee calculations |

## Programs

| Program | ID | Purpose |
|---------|-----|---------|
| Pump | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` | Bonding curve create/buy/sell/migrate |
| PumpAMM | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` | Post-graduation AMM pools |
| PumpFees | `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ` | Fee sharing/distribution |

## Social Fee PDA Requirements

If you are adding a **GitHub recipient** as a fee recipient in sharing config, make sure to initialize the social fee PDA before adding it as a recipient:

```ts
import { Platform, PUMP_SDK } from "@pump-fun/pump-sdk";

// 1) Update an existing sharing config
await PUMP_SDK.updateSharingConfigWithSocialRecipients({
  authority,
  mint,
  currentShareholders,
  newShareholders: [
    { address: authority, shareBps: 7000 },
    { userId: "1234567", platform: Platform.GitHub, shareBps: 3000 },
  ],
});

// 2) Create sharing config + set social recipients in one flow
await PUMP_SDK.createSharingConfigWithSocialRecipients({
  creator,
  mint,
  pool,
  newShareholders: [
    { address: creator, shareBps: 7000 },
    { userId: "1234567", platform: Platform.GitHub, shareBps: 3000 },
  ],
});
```

### Checklist

- [ ] The GitHub user must be able to log in to claim fees. **GitHub organizations are not supported** for social fee recipients.
- [ ] Only `Platform.GitHub` is supported.
- [ ] Fees in a GitHub vault can only be claimed by the linked GitHub user through Pump.fun (web or mobile).
- [ ] You have initialized the social fee recipient PDA by using one of the above helpers or `createSocialFeePda`.

---

## Mayhem Mode

### Mayhem program ID:
`MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e`

### Mayhem fee recipients (use any one randomly):
- `GesfTA3X2arioaHp8bbKdjG9vJtskViWACZoYyxp4twS`
- `4budycTjhs9fD6xw62VBducVTNgMgJJ5BgtKq7mAZwn6`
- `8SBKzEQU4nLSzcwF4a74F2iaUDQyTfjGndn6qUWBnrpR`
- `4UQeTP1T39KZ9Sfxzo3WR5skgsaP6NZa87BAkuazLEKH`
- `8sNeir4QsLsJdYpc9RZacohhK1Y5FLU3nC5LXgYB4aa6`
- `Fh9HmeLNUMVCvejxCtCL2DbYaRyBFVJ5xrWkLnMH6fdk`
- `463MEnMeGyJekNZFQSTUABBEbLnvMTALbT6ZmsxAbAdq`
- `6AUH3WEHucYZyC61hqpqYUWVto5qA5hjHuNQ32GNnNxA`

### Changes Summary

1. **BondingCurve and Pool struct size increase**: `bondingCurve` account needs at least **82 bytes** (was 81), `pool` needs **244 bytes** (was 243). New `is_mayhem_mode` boolean field.
2. **New `create_v2` instruction**: Uses Token2022 program for token creation and metadata.
3. **New fee recipient requirement**: For `is_mayhem_mode = true` coins, pass a Mayhem fee recipient.

### Action Items

| Change | Action Required |
|--------|----------------|
| Introduction of `create_v2` | Update creation flow to use `create_v2` instruction with Token2022 program |
| Fee recipient for mayhem mode | Pass Mayhem fee recipient at specified account indexes (Pump Swap: 10, Bonding Curve: 2) |

### Checklist
- [ ] Migrate to `create_v2` for new tokens
- [ ] For mints owned by Token2022, ensure you're passing the right associated bonding curve, user token account and token program
- [ ] Handle `is_mayhem_mode = true` by setting the correct fee recipient
- [ ] Confirm fee recipient WSOL token account configuration
