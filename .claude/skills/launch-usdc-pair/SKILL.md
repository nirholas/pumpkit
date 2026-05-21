---
name: launch-usdc-pair
description: Use this skill when the user wants to launch a pump.fun coin paired with USDC (instead of SOL), or to add USDC-pair support to existing PumpKit launch/trade code. Triggers on phrases like "USDC quote mint", "USDC pair launch", "V2 create", "pair with USDC instead of SOL". Skip for SOL-only flows — legacy instructions still work for SOL pairs.
---

# Launch a pump.fun coin with USDC as the quote pair

Pump.fun enabled **USDC as a quote mint** for `create` and trade on **2026-05-21**. This skill is the project-specific reference for wiring that into PumpKit code.

## Critical facts

- **USDC-paired coins can only be traded via V2 instructions.** Legacy `buy` / `sell` instructions will reject them.
- **SOL-paired coins still trade in native SOL**, but the quote mint must be passed as the **wrapped SOL mint** (`So11111111111111111111111111111111111111112`) in V2 calls.
- **Legacy instructions continue to work** for SOL-paired coins.
- Authoritative spec: [pump-fun/pump-public-docs](https://github.com/pump-fun/pump-public-docs).

## USDC mint (mainnet)

```
EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

(Devnet has its own USDC mint — confirm before using in tests.)

## When to reach for this skill

Reach for it any time:
- A user asks to launch with a non-SOL quote.
- An existing call site uses V1 `buy` / `sell` and you need to migrate it to V2 to support USDC pairs.
- The codebase passes a `quoteMint` parameter without distinguishing SOL vs USDC.

## Workflow

### 1. Decide which V2 instructions you need

| Action | V2 instruction | Notes |
|---|---|---|
| Create coin | `create_v2` (or whatever the SDK exposes — check `@nirholas/pump-sdk` types) | Pass `quote_mint = USDC_MINT` or `quote_mint = WSOL_MINT` |
| Buy | V2 `buy` | Required for USDC pairs |
| Sell | V2 `sell` | Required for USDC pairs |
| Collect creator fee | See [pump-public-docs/instructions/COLLECT_CREATOR_FEE.md](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/COLLECT_CREATOR_FEE.md) |
| Creator fee sharing | See [pump-public-docs/instructions/CREATOR_FEE_SHARING.md](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/CREATOR_FEE_SHARING.md) |

### 2. Confirm the SDK exposes V2 typed decoders

```bash
ls node_modules/@nirholas/pump-sdk/dist | grep -i v2
```

Recent commits (`refactor(channel): use typed V2 event decoders from @nirholas/pump-sdk`) moved channel + event-monitor onto V2 — use those files as a working reference:

- [packages/channel/src/](packages/channel/src/)
- `packages/core/src/monitor/` (V2 events flow through these)

### 3. Wire up quote-mint awareness

The shape of the `quote_mint` argument in V2 calls is what determines the pair. Don't try to infer it from the coin mint — pass it explicitly.

```typescript
import { PublicKey } from '@solana/web3.js';

const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// User-selected pair:
const quoteMint = pairChoice === 'USDC' ? USDC_MINT : WSOL_MINT;
```

### 4. Mint keypair for the launch token

The launch coin still needs its own mint. Use the project's vanity wrapper:

```bash
bash tools/generate-vanity.sh --suffix pump <prefix>
```

Confirm the on-chain `create_v2` instruction's mint-suffix constraint against the public-docs repo before grinding — the convention has historically been `pump` suffix, but a USDC-pair launch may relax or change that.

### 5. Verify funding before broadcasting

```bash
npx tsx tools/check-pump-funding.ts <deployer-pubkey>
```

If the deployer was seeded by pump.fun's wallet, the deployment is a leaked-launch (see [tmp/leaked-launch/](tmp/leaked-launch/) scratch workflow). For a fresh organic launch, the deployer should not be pump-seeded.

### 6. Test on devnet first

Both `create_v2` and the USDC pair are live on mainnet as of 2026-05-21, but the program may not have been deployed to devnet at the same time. Confirm with:

```bash
solana program show <PROGRAM_ID> --url devnet
```

## Common mistakes to avoid

- **Calling legacy `buy` on a USDC-paired coin.** It will fail. Use V2.
- **Passing the coin's mint as `quote_mint`.** The quote mint is the pair currency (USDC or WSOL), not the launched coin.
- **Assuming SOL pairs need no change.** They still work with legacy instructions, but new V2 callers must pass WSOL as the quote mint.
- **Grinding a mint without the `pump` suffix.** Check the program's current constraint — don't waste hours of CPU on an address the program will reject.

## Local references

- [CLAUDE.md](CLAUDE.md) — project memory, V2/USDC section
- [tutorials/46-usdc-pair-launches.md](tutorials/46-usdc-pair-launches.md) — step-by-step USDC launch
- [tutorials/47-v2-creator-fees.md](tutorials/47-v2-creator-fees.md) — V2 creator-fee collection & sharing
- [tutorials/06-migration.md](tutorials/06-migration.md) — graduation/migration deep dive
