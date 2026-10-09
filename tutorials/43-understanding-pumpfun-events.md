# Tutorial 4: Understanding PumpFun Events

> How the Pump protocol emits events and how PumpKit decodes them from transaction logs.

## Event Architecture

PumpFun programs emit events via **Anchor CPI self-invoke** — the program calls itself with a special `__event_authority` PDA, and the event data appears in `Program data:` log lines encoded as base64.

```
Transaction logs:
  Program pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ invoke [1]
  Program log: Instruction: ClaimSocialFeePda
  Program data: MhLBQe3S6uw...base64...
  Program pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ success
```

## Three Programs

| Program | ID | Events |
|---------|-----|--------|
| **Pump** | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` | Create, Trade, Complete, CompletePumpAmmMigration, PostCompleteBuy, SweepBondingCurveFee |
| **PumpAMM** | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` | Buy, Sell, Deposit, Withdraw, CreatePool, SweepPoolFee |
| **PumpFees** | `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ` | SocialFeePdaClaimed, DistributeCreatorFees, CreateFeeSharingConfig |

## Event Discriminators

Every Anchor event starts with an 8-byte discriminator (first 8 bytes of `sha256("event:EventName")`). PumpKit uses hex-encoded discriminators to match events:

```typescript
// Fee claim events
const SOCIAL_FEE_PDA_CLAIMED = '3212c141edd2eaec';
const DISTRIBUTE_CREATOR_FEES = 'a537817004b3ca28';
const COLLECT_CREATOR_FEE     = '7a027f010ebf0caf';
const COLLECT_COIN_CREATOR_FEE = 'e8f5c2eeeada3a59';
const CLAIM_CASHBACK           = 'e2d6f62107f293e5';

// Config events
const CREATE_FEE_SHARING_CONFIG = '8569aac8b874fb58';
const UPDATE_FEE_SHARES         = '15bac4b85be4e1cb';

// Token lifecycle events (Pump program)
const CREATE_EVENT                 = '1b72a94ddeeb6376'; // emitted by both create and create_v2
const TRADE_EVENT                  = 'bddb7fd34ee661ee';
const COMPLETE_EVENT               = '5f72619cd42e9808';
const COMPLETE_AMM_MIGRATION_EVENT = 'bde95db95c94ea94';

// October 2026 upgrade (Pump program)
const POST_COMPLETE_BUY_EVENT        = '6fb06d8b316cd5fb'; // synthetic migration: the part of a buy filled after the curve completed
const SWEEP_BONDING_CURVE_FEE_EVENT  = '742b4dbd117a482b'; // bucket 0 = protocol, 1 = creator

// PumpSwap (PumpAMM program)
const AMM_BUY_EVENT       = '67f4521f2cf57777';
const AMM_SELL_EVENT      = '3e2f370aa503dc2a';
const SWEEP_POOL_FEE_EVENT = '82a42461e48287a5'; // bucket 0 = protocol, 1 = creator
```

`@pumpkit/core` exports each one as a `Uint8Array` (`TRADE_EVENT_DISCRIMINATOR`, `POST_COMPLETE_BUY_EVENT_DISCRIMINATOR`, `SWEEP_BONDING_CURVE_FEE_EVENT_DISCRIMINATOR`, `SWEEP_POOL_FEE_EVENT_DISCRIMINATOR` and so on, in `solana/programs.ts`), and `parsePumpLogEvents()` decodes the trade, complete, post-complete-buy and sweep events (on both programs) for you:

```typescript
import { parsePumpLogEvents, aggregateTrades } from '@pumpkit/core';

const events = parsePumpLogEvents(tx.meta?.logMessages ?? []);
// One entry per buy or sell, with any PostCompleteBuyEvent folded into its TradeEvent
const trades = aggregateTrades(events);
for (const t of trades) {
  if (t.syntheticMigration) console.log('buy completed the curve and filled in the pool');
}
```

### What changed in October 2026

- A `TradeEvent` from `buy_v3` / `sell_v3` / `buy_exact_quote_in_v3` has `fee_recipient` set to the zero key: the fee stayed on the bonding curve (`BondingCurve.protocol_fees` / `creator_fee`) and leaves later in a `SweepBondingCurveFeeEvent`. `creator_fee_unclaimed` reports what is waiting.
- A buy that completes the curve and keeps going (synthetic migration) logs `TradeEvent`, then `CompleteEvent`, then `PostCompleteBuyEvent`. The buyer's real total is the sum of the trade and the post-complete leg, and the post-complete `quoteIn` already includes fees.
- PumpSwap `buy_v2` / `sell_v2` keep fees in `Pool.protocol_fees` / `creator_fees` and they leave in a `SweepPoolFeeEvent`.

[Tutorial 55](./55-october-2026-trade-upgrade.md) walks through every new instruction and event end to end.

## Instruction Discriminators

PumpKit also matches instructions (not just events) to detect claim types:

```typescript
const CLAIM_INSTRUCTIONS = [
  { discriminator: 'e115fb85a11ec7e2', claimType: 'claim_social_fee_pda', programId: PUMP_FEE_PROGRAM_ID },
  { discriminator: '1416567bc61cdb84', claimType: 'collect_creator_fee', programId: PUMP_PROGRAM_ID },
  { discriminator: 'a039592ab58b2b42', claimType: 'collect_coin_creator_fee', programId: PUMP_AMM_PROGRAM_ID },
  { discriminator: 'a572670079cef751', claimType: 'distribute_creator_fees', programId: PUMP_PROGRAM_ID },
  { discriminator: '253a237ebe35e4c5', claimType: 'claim_cashback', programId: PUMP_PROGRAM_ID },
  { discriminator: '253a237ebe35e4c5', claimType: 'claim_cashback', programId: PUMP_AMM_PROGRAM_ID },
];
```

The full list (including the V2 variants and `transfer_creator_fees_to_pump`) lives in `CLAIM_INSTRUCTIONS` in `packages/monitor/src/types.ts`.

Since the October 2026 upgrade, a claim is often preceded in the same transaction by a permissionless sweep that moves fees kept on the curve or pool into the creator vault. Both programs use the same instruction names, so match on program ID too:

```typescript
// Trade instructions (Pump program)
const BUY_V3                 = '07051dc4f5176550';
const SELL_V3                = '1c92de7726c469d5';
const BUY_EXACT_QUOTE_IN_V3  = 'e1f7501ed5b38488';
const MULTI_HOP_CURVE_SWAP   = 'e19a7516d756f667';

// Trade instructions (PumpAMM program)
const AMM_BUY_V2                 = 'b817ee6167c5d33d';
const AMM_SELL_V2                = '5df6823ce7e940b2';
const AMM_BUY_EXACT_QUOTE_IN_V2  = 'c2ab1c46684d5b2f';
const MULTI_HOP_SWAP             = '2b644913e9f66f94';

// Fee sweeps (same discriminator on Pump and PumpAMM)
const SWEEP_PROTOCOL_FEE = '0830be07b644b7e5';
const SWEEP_CREATOR_FEE  = '20f6bf3408c949ba';
```

A sweep with nothing waiting succeeds and does nothing, so treat a sweep instruction without a matching `Sweep*FeeEvent` (or with an `amount` of 0) as a no-op, the same way as the fake claims below. The core exports are `BUY_V3_DISCRIMINATOR`, `AMM_BUY_V2_DISCRIMINATOR`, `MULTI_HOP_SWAP_DISCRIMINATOR`, `SWEEP_CREATOR_FEE_DISCRIMINATOR` and their siblings.

## SocialFeePdaClaimed Event Layout

The most complex event to parse:

```
Offset  Size  Field
0       8     Discriminator (3212c141edd2eaec)
8       8     Timestamp (i64 LE)
16      4     user_id length (u32 LE)
20      N     user_id (UTF-8 string, e.g. "12345678")
20+N    1     platform (u8: 0=pump, 1=twitter, 2=github)
21+N    32    social_fee_pda (pubkey)
53+N    32    recipient (pubkey)
85+N    32    social_claim_authority (pubkey)
117+N   8     amount_claimed (u64 LE)
125+N   8     claimable_before (u64 LE)
133+N   8     lifetime_claimed (u64 LE)
141+N   8     recipient_balance_before (u64 LE)
149+N   8     recipient_balance_after (u64 LE)
```

### Parsing Example

```typescript
function parseSocialFeeClaim(bytes: Buffer) {
    let offset = 16; // skip disc + timestamp

    // user_id: Borsh string (4-byte length prefix + UTF-8)
    const uidLen = bytes.readUInt32LE(offset);
    offset += 4;
    const userId = bytes.subarray(offset, offset + uidLen).toString('utf8');
    offset += uidLen;

    // platform: u8
    const platform = bytes[offset]!;
    offset += 1;

    // social_fee_pda: pubkey
    const socialFeePda = new PublicKey(bytes.subarray(offset, offset + 32)).toBase58();
    offset += 32;

    // recipient: pubkey
    const recipient = new PublicKey(bytes.subarray(offset, offset + 32)).toBase58();
    offset += 32;

    // skip social_claim_authority
    offset += 32;

    // amount_claimed: u64
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const amountLamports = Number(view.getBigUint64(offset, true));
    offset += 8;

    // skip claimable_before
    offset += 8;

    // lifetime_claimed: u64
    const lifetimeLamports = Number(view.getBigUint64(offset, true));

    return {
        userId,
        platform,       // 2 = GitHub
        socialFeePda,
        recipient,
        amountLamports,
        lifetimeLamports,
    };
}
```

## Monitoring Strategies

### WebSocket (Real-Time)

```typescript
connection.onLogs(
    new PublicKey(PUMP_FEE_PROGRAM_ID),
    (logInfo) => {
        for (const line of logInfo.logs) {
            if (line.includes('Program data:')) {
                const b64 = line.split('Program data: ')[1];
                const bytes = Buffer.from(b64, 'base64');
                const disc = bytes.subarray(0, 8).toString('hex');
                // Match discriminator and parse event...
            }
        }
    },
    'confirmed',
);
```

### HTTP Polling (Fallback)

```typescript
// Poll for recent signatures
const sigs = await connection.getSignaturesForAddress(
    new PublicKey(PUMP_FEE_PROGRAM_ID),
    { limit: 20 },
    'confirmed',
);

// Fetch and parse each transaction
for (const sig of sigs) {
    const tx = await connection.getParsedTransaction(sig.signature, {
        maxSupportedTransactionVersion: 0,
    });
    // Parse instructions and log events...
}
```

## Key Gotcha: Fake Claims

A `claim_social_fee_pda` instruction can be called without a matching `SocialFeePdaClaimed` event being emitted — this happens when the PDA has nothing to claim. PumpKit detects these as "fake claims" (amount = 0) and marks them with a ⚠️ badge.

## Next Steps

- [RPC Best Practices](../docs/rpc-best-practices.md) — rate limits, fallback, batching
- See the [Official Pump IDL files](https://github.com/pump-fun/pump-public-docs) for complete instruction/event definitions
