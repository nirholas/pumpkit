# Tutorial 51 — Bonding curve internals: state, math, and graduation mechanics

> Audience: developers who want to read curve state directly, compute quotes offline, or understand exactly when a coin graduates. Builds on [tutorial 05](05-bonding-curve-math.md) and [tutorial 06](06-migration.md).
>
> Companion command: [.claude/commands/inspect-curve.md](../.claude/commands/inspect-curve.md)

The bonding curve is the heart of every pump.fun coin until graduation. Every buy, sell, fee accrual, and migration trigger flows through one account: the **bonding-curve PDA** owned by the pump program. This tutorial dissects that account, walks through the constant-product math, and shows how to compute everything offline.

## The bonding-curve account

Every coin has exactly one bonding-curve account, deterministically derived from the mint:

```typescript
import { PublicKey } from '@solana/web3.js';
import { PUMP_PROGRAM_ID } from '@pumpkit/core/solana/programs';

function deriveBondingCurve(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mint.toBuffer()],
    PUMP_PROGRAM_ID,
  );
}
```

The PDA's data is a packed struct. Field order and types are authoritative in [@nirholas/pump-sdk](https://www.npmjs.com/package/@nirholas/pump-sdk) — `BondingCurveAccount` exported type. Expect roughly:

| Field | Type | Meaning |
|---|---|---|
| `discriminator` | `u8[8]` | Anchor account tag |
| `virtual_token_reserves` | `u64` | Curve's virtual token balance (constant-product term) |
| `virtual_sol_reserves` | `u64` | Curve's virtual SOL balance (or quote balance in V2) |
| `real_token_reserves` | `u64` | Tokens actually held by the curve |
| `real_sol_reserves` | `u64` | SOL/quote actually held by the curve |
| `token_total_supply` | `u64` | Total supply minted at creation |
| `complete` | `bool` | True once graduated to AMM |
| `creator` | `PublicKey` | Original deployer |
| `quote_mint` | `PublicKey` (V2) | WSOL or USDC, depending on pair |

> Field names/sizes may differ slightly per SDK version. Always read the SDK's `.d.ts` file rather than copying from this table.

## Constant-product pricing

The curve enforces `x * y = k` where:

```
x = virtual_token_reserves
y = virtual_sol_reserves
k = x * y         (invariant)
```

The *virtual* reserves are the curve's accounting state; the *real* reserves are what's actually held in the curve's token accounts. The gap between them is what makes pump-style curves work: at launch, virtual reserves are seeded to a non-zero starting point so the initial price isn't zero, even though no tokens have been traded yet.

### Computing a buy quote

Given a `quote_in` (lamports of SOL, or atomic units of USDC), the tokens you receive are:

```
tokens_out = x - (k / (y + quote_in))
           = x - (x * y) / (y + quote_in)
```

Equivalently:

```
tokens_out = (x * quote_in) / (y + quote_in)
```

Implemented:

```typescript
export function quoteBuy(curve: BondingCurveAccount, quoteIn: bigint): bigint {
  const x = curve.virtualTokenReserves;
  const y = curve.virtualSolReserves;
  return (x * quoteIn) / (y + quoteIn);
}
```

### Computing a sell quote

Inverse direction — given `tokens_in`, you receive:

```
quote_out = y - (k / (x + tokens_in))
          = (y * tokens_in) / (x + tokens_in)
```

```typescript
export function quoteSell(curve: BondingCurveAccount, tokensIn: bigint): bigint {
  const x = curve.virtualTokenReserves;
  const y = curve.virtualSolReserves;
  return (y * tokensIn) / (x + tokensIn);
}
```

### Computing the spot price

Marginal price (quote per single token at the current state) is:

```
spot_price = y / x
```

Implemented:

```typescript
export function spotPrice(curve: BondingCurveAccount): number {
  return Number(curve.virtualSolReserves) / Number(curve.virtualTokenReserves);
}
```

For USDC-paired V2 curves, the units are USDC-atomics per token-atomic. Convert with the appropriate decimals.

## Fees

Fees are *not* part of the constant-product invariant. They are deducted before/after the swap math. The pump program structure (as of late 2026):

- A **platform fee** in basis points on every trade.
- A **creator fee** in basis points (V2 introduced explicit creator-fee primitives — see [tutorial 47](47-v2-creator-fees.md)).
- Optional **fee-share splits** for collaborations.

The fee schedule is encoded in a global protocol-config account (or stamped on each bonding curve at creation, depending on version). To get the authoritative number:

```typescript
import { fetchProtocolConfig } from '@nirholas/pump-sdk';
const cfg = await fetchProtocolConfig(connection);
console.log({
  platformFeeBps: cfg.platformFeeBps,
  creatorFeeBps:  cfg.creatorFeeBps,
});
```

Don't hardcode fee bps. They change.

## Graduation

A coin graduates from the bonding curve to the AMM when `real_token_reserves` drops below a protocol-defined threshold (call it `T_graduate`). At that moment:

1. The pump program calls into the AMM program to seed an LP pool.
2. The bonding curve's `complete` flag flips to `true`.
3. Subsequent buys/sells route through the AMM, not the curve.

To detect imminent graduation offline:

```typescript
export function graduationProgressBps(curve: BondingCurveAccount, threshold: bigint): number {
  if (curve.complete) return 10_000;
  const sold = curve.tokenTotalSupply - curve.realTokenReserves;
  const graduateSupply = curve.tokenTotalSupply - threshold;
  return Number((sold * 10_000n) / graduateSupply);
}
```

Useful alarms:

| Progress | Action |
|---|---|
| 50% | Note in dashboard, no action |
| 80% | Pre-arm migration handler |
| 95% | Stop new entries; expect price spike & high MEV |
| 99% | Migration imminent — watch for `complete` flip next slot |

The exact threshold and program ID for the AMM differ between V1 and V2 launches. Consult [packages/core/src/solana/programs.ts](../packages/core/src/solana/programs.ts) for the current values.

## Reading curve state directly

For a single curve:

```typescript
import { fetchBondingCurve } from '@nirholas/pump-sdk';

const [curvePda] = deriveBondingCurve(mint);
const curve = await fetchBondingCurve(connection, curvePda);
console.log({
  spot:     spotPrice(curve),
  progress: graduationProgressBps(curve, THRESHOLD) / 100 + '%',
  done:     curve.complete,
});
```

For many curves in one shot (more efficient than N round trips):

```typescript
import { getMultipleAccountsInfo } from '@solana/web3.js';

const pdas = mints.map(m => deriveBondingCurve(m)[0]);
const infos = await connection.getMultipleAccountsInfo(pdas, 'confirmed');
const curves = infos.map((info, i) => info ? decodeBondingCurve(info.data) : null);
```

A single `getMultipleAccountsInfo` round trip handles up to 100 accounts. For larger sets, batch into 100-account chunks and parallelise.

## Subscribing to curve updates

For live tracking of a single curve:

```typescript
const subId = connection.onAccountChange(
  curvePda,
  (acct) => {
    const curve = decodeBondingCurve(acct.data);
    handleUpdate(curve);
  },
  'confirmed',
);
```

For all curves of a given program (firehose), use `programSubscribe` with filters. Be aware that this is a high-volume stream — every trade on every coin triggers an update. Use only if you have downstream throughput to match.

## Common pitfalls

- **Using real reserves for pricing.** The curve math uses *virtual* reserves. Real reserves grow with deposits but pricing follows virtual.
- **Forgetting decimals.** Spot price is `quote_atomic / token_atomic`. Convert with `10^quote_decimals / 10^token_decimals` for human-readable prices.
- **Hardcoding the graduation threshold.** It has changed before, and may differ per protocol version. Read from the protocol-config account.
- **Treating V1 and V2 curves as interchangeable.** V2 has a `quote_mint` field; V1 doesn't. If your decoder ignores the discriminator, you'll silently misread one of them.
- **Polling `getAccountInfo` in a tight loop.** Use `onAccountChange` for live updates, batch reads for cold queries.
- **Trusting the `complete` flag without verifying the AMM pool exists.** A coin can be `complete: true` for a few slots before the AMM pool is visible to RPC due to commitment lag. Confirm both sides.

## See also

- [tutorials/05-bonding-curve-math.md](05-bonding-curve-math.md) — original math overview
- [tutorials/06-migration.md](06-migration.md) — graduation flow & AMM handoff
- [tutorials/28-analytics-price-quotes.md](28-analytics-price-quotes.md) — using SDK quote functions
- [.claude/commands/inspect-curve.md](../.claude/commands/inspect-curve.md) — slash-command for decoding any curve
- [.claude/agents/migration-detector.md](../.claude/agents/migration-detector.md) — agent for graduation-aware work
- [@nirholas/pump-sdk](https://www.npmjs.com/package/@nirholas/pump-sdk) — authoritative account decoders
