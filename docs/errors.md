# Error Reference

Custom error classes thrown by the SDK, with causes and fixes.

---

## Fee Sharing Errors

These errors are thrown when configuring fee sharing shareholders. All shares must total exactly **10,000 BPS** (100%).

### NoShareholdersError

```
No shareholders provided
```

**Cause:** Empty `shareholders` array passed to fee sharing config.
**Fix:** Provide at least one shareholder.

---

### TooManyShareholdersError

```
Too many shareholders. Maximum allowed is 10, got 12
```

**Cause:** More than 10 shareholders in the config.
**Fix:** Reduce to 10 or fewer shareholders. Properties: `count`, `max`.

---

### ZeroShareError

```
Zero or negative share not allowed for address BYsXqJ...
```

**Cause:** A shareholder has `shareBps` of 0 or negative.
**Fix:** Every shareholder must have a positive share. Property: `address`.

---

### InvalidShareTotalError

```
Invalid share total. Must equal 10,000 basis points (100%). Got 9500
```

**Cause:** Shares don't sum to exactly 10,000 BPS.
**Fix:** Adjust shares so they total 10,000. Property: `total`.

---

### DuplicateShareholderError

```
Duplicate shareholder addresses not allowed
```

**Cause:** Same address appears more than once in the shareholders array.
**Fix:** Merge duplicate entries into a single shareholder with combined BPS.

---

### ShareCalculationOverflowError

```
Share calculation overflow - total shares exceed maximum value
```

**Cause:** Internal arithmetic overflow during share calculation.
**Fix:** Reduce share values. This typically indicates a bug — file an issue.

---

## Handling Errors

```typescript
import {
  NoShareholdersError,
  TooManyShareholdersError,
  ZeroShareError,
  InvalidShareTotalError,
  DuplicateShareholderError,
  PUMP_SDK,
} from "@nirholas/pump-sdk";

try {
  const ix = await PUMP_SDK.updateFeeShares({
    authority: wallet,
    mint: tokenMint,
    currentShareholders: [wallet],
    newShareholders: shares,
  });
} catch (err) {
  if (err instanceof InvalidShareTotalError) {
    console.error(`Shares total ${err.total}, need 10000`);
  } else if (err instanceof TooManyShareholdersError) {
    console.error(`${err.count} shareholders, max ${err.max}`);
  } else if (err instanceof ZeroShareError) {
    console.error(`Zero share for ${err.address}`);
  }
}
```

---

## On-Chain Errors

The Anchor programs also return errors via transaction logs. Common on-chain errors:

| Error | Program | Cause |
|-------|---------|-------|
| `InsufficientFunds` | Pump | Not enough SOL for buy |
| `SlippageExceeded` | Pump/PumpAMM | Price moved beyond slippage tolerance |
| `BondingCurveComplete` | Pump | Token already graduated — use AMM |
| `Unauthorized` | All | Wrong authority/signer |
| `AccountNotFound` | All | PDA doesn't exist yet |

These are standard Anchor errors and appear in transaction logs — not as SDK exceptions.

### Program error codes (October 2026 upgrade)

Custom program errors show up as `custom program error: 0x...` (hex) or `Error Number: 6095` in the logs. These are the codes integrators hit most often after the upgrade, taken from the official IDLs. `@pumpkit/core` exports the new ones as `PUMP_ERROR_CODES`, `PUMP_AMM_ERROR_CODES` and `PUMP_FEES_ERROR_CODES`.

| Code | Program | Name | Cause and fix |
|------|---------|------|---------------|
| 6002 / 6003 | Pump | `TooMuchSolRequired` / `TooLittleSolReceived` | Slippage on a curve trade. Requote and widen the bound. |
| 6005 | Pump | `BondingCurveComplete` | The curve is complete. Trade on PumpSwap, or let a v3 buy fill the rest through synthetic migration. |
| 6021 | Pump | `NotEnoughTokensToBuy` | The buy asks for more tokens than the curve has left. |
| 6094 | Pump | `CashbackCoinNotSupported` | v3 trades refuse cashback coins. Use `buy_v2` / `sell_v2`. |
| 6095 | Pump | `CreatorFeesNotSwept` | A creator fee waits on the curve. Put `sweep_creator_fee` first in the same transaction as distribute, CTO or `create_fee_sharing_config`. |
| 6098 | Pump | `MultiHopDiscontinuousPath` | A hop's input mint is neither side of its curve. |
| 6107 | Pump | `QuoteCurveAwaitingMigration` | The pump-coin quote's own curve is complete but not migrated yet. Retry after `migrate_v2`. |
| 6108 | Pump | `MultiHopMayhemCurveNotSupported` | Mayhem curves cannot be routed. Use the v2 instructions. |
| 6004 | PumpAMM | `ExceededSlippage` | Slippage on a pool trade. |
| 6063 | PumpAMM | `InsufficientRealQuoteReserves` | A sell would pay out more than the real quote vault holds (virtual quote reserves only price, never pay). |
| 6079 | PumpAMM | `CashbackCoinNotSupported` | v2 pool trades refuse cashback pools. Use v1 `buy` / `sell`. |
| 6080 | PumpAMM | `MayhemPoolNotSupported` | A multi-hop swap routed through a mayhem pool. Trade that pool directly: per the upstream trade docs, v1 and v2 both accept mayhem pools. |
| 6081 | PumpAMM | `CreatorFeesNotSwept` | A creator fee waits in the pool. Sweep it first. |
| 6084 | PumpAMM | `MultiHopDiscontinuousPath` | The route does not connect, or does not end in the output account's mint. |
| 6086 | PumpAMM | `MultiHopMixedDirection` | Every hop must trade the same way: all buys or all sells. |
| 6009 | PumpFees | `SharingConfigAdminRevoked` | The share list was already set; it can be updated once. |
| 6033 | PumpFees | `PoolCreatorFeesNotSwept` | Sweep the pool creator fee before changing shares. |

Background: [tutorial 55](../tutorials/55-october-2026-trade-upgrade.md) and the upstream [SWEEP_FEES.md](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/SWEEP_FEES.md).

---

## Related

- [Fee Sharing](./fee-sharing.md) — Share configuration
- [API Reference](./api-reference.md) — Full SDK API
