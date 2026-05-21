# Tutorial 46 — Launch a pump.fun coin paired with USDC

> Audience: developers who already understand the V1 SOL-pair launch flow (see [tutorial 01](01-create-token.md)) and want to add USDC quote-mint support.
>
> Rolled out: **2026-05-21** — pump.fun enabled USDC as a quote mint for create + trade.

## What changed

On 2026-05-21 pump.fun enabled **USDC** as a quote mint for creating and trading pump coins. The official announcement and authoritative spec live at [pump-fun/pump-public-docs](https://github.com/pump-fun/pump-public-docs). The key rules:

1. **USDC-paired coins can only be traded via V2 instructions.** Legacy `buy` / `sell` will reject them.
2. **SOL-paired coins still trade in native SOL**, but the quote mint must be passed as the **wrapped SOL** mint (`So11111111111111111111111111111111111111112`) in V2 calls.
3. **Legacy instructions continue to work** for SOL-paired coins.

If your code only launches with SOL today, you don't have to migrate — but if you want to ship a USDC-quote launch, you'll be on V2 end-to-end.

## Quote mints

```
USDC mainnet:  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
USDC devnet:   <verify on https://spl.solana.com — devnet USDC is a separate mint>
WSOL:          So11111111111111111111111111111111111111112
```

Always **pass the quote mint explicitly**. Don't infer it from the coin mint or from the launcher's intent — it's a real account that the V2 instruction reads.

## Prerequisites

```bash
# Already in this repo
node --version          # >= 20
solana-keygen --version # any recent
npm install             # bootstraps workspaces
```

Plus a funded keypair on mainnet (or devnet for testing) and an RPC URL with reasonable rate limits.

## Step 1 — Grind a launch mint

Pump.fun's mint convention has historically required the launched coin's mint address to end in `pump`. Confirm whether the V2 `create` instruction still enforces this before grinding — the public-docs repo is authoritative.

```bash
# Standard pump-suffix launch mint
bash tools/generate-vanity.sh --suffix pump <YourPrefix>
```

The wrapper writes to the current directory with mode `600` and prints the pubkey. Move it into a scratch dir under `tmp/` so it isn't accidentally committed:

```bash
mkdir -p tmp/usdc-launch
mv <prefix>*pump.json tmp/usdc-launch/
```

## Step 2 — Pick the quote mint

```typescript
import { PublicKey } from '@solana/web3.js';

const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

const pair: 'SOL' | 'USDC' = 'USDC';  // user choice
const quoteMint = pair === 'USDC' ? USDC_MINT : WSOL_MINT;
```

## Step 3 — Build the V2 create instruction

The exact instruction name and arg shape come from `@nirholas/pump-sdk`. Read the SDK's types directly — they're the source of truth as the program evolves:

```bash
ls node_modules/@nirholas/pump-sdk/dist | grep -i v2
```

A representative V2 create call looks like:

```typescript
import { Connection, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { buildCreateV2Ix } from '@nirholas/pump-sdk'; // verify exact export name

const connection = new Connection(process.env.SOLANA_RPC_URL!, 'confirmed');
const payer = Keypair.fromSecretKey(/* your funded deployer */);
const mint  = Keypair.fromSecretKey(/* the vanity mint from step 1 */);

const ix = await buildCreateV2Ix({
  payer:     payer.publicKey,
  mint:      mint.publicKey,
  quoteMint,                      // <-- this is the change
  name:      'My Coin',
  symbol:    'MYC',
  uri:       'https://…/metadata.json',
  // creator-fee + sharing fields per the public docs
});

const tx = new Transaction().add(ix);
const sig = await sendAndConfirmTransaction(connection, tx, [payer, mint]);
console.log('Launched:', sig);
```

If `buildCreateV2Ix` (or whatever the SDK exposes) doesn't exist in your installed version, bump the SDK:

```bash
npm install @nirholas/pump-sdk@latest
```

## Step 4 — Trading the new coin

All trades against a USDC-paired coin **must** use V2 `buy` / `sell`. The V2 entry points take the same `quoteMint` argument — pass `USDC_MINT` for USDC-paired coins.

```typescript
import { buildBuyV2Ix, buildSellV2Ix } from '@nirholas/pump-sdk';

// User buying with USDC
const buyIx = await buildBuyV2Ix({
  buyer:     wallet.publicKey,
  mint:      coinMint,
  quoteMint: USDC_MINT,
  quoteAmount: 1_000_000n,    // 1 USDC (6 decimals)
  minTokensOut: someSlippageGuard,
});
```

Don't reach for the legacy buy instruction — it will fail with a program error against a USDC-paired curve.

## Step 5 — Verify on chain

Before announcing the launch:

```bash
# Funding source — make sure your deployer is not a leaked-launch (pump-seeded) wallet
npx tsx tools/check-pump-funding.ts <deployer-pubkey>

# Permissions on the mint keypair
bash tools/check-file-permissions.sh tmp/usdc-launch
```

## Common pitfalls

- **Calling legacy `buy` on a USDC pair.** Will fail; switch to V2.
- **Passing the coin mint as `quoteMint`.** The quote mint is the pair currency (USDC or WSOL), never the launched coin.
- **Assuming a `pump` suffix is mandatory under V2.** Check the program's constraint before spending hours on the grind.
- **Forgetting that SOL-pair V2 calls still need WSOL passed.** Even though trades settle in native SOL.
- **Devnet testing.** Devnet USDC is a different mint, and the V2 program may not be deployed there at the same time as mainnet — verify with `solana program show`.

## See also

- Skill: [.claude/skills/launch-usdc-pair/SKILL.md](../.claude/skills/launch-usdc-pair/SKILL.md)
- Next tutorial: [tutorials/47-v2-creator-fees.md](47-v2-creator-fees.md) — V2 creator-fee collection + sharing
- Authoritative protocol docs: [pump-fun/pump-public-docs](https://github.com/pump-fun/pump-public-docs)
- Earlier vanity coverage: [tutorials/13-vanity-addresses.md](13-vanity-addresses.md), [tutorials/31-rust-vanity-deep-dive.md](31-rust-vanity-deep-dive.md)
