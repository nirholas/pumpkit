# Tutorial 46 — Launch a pump.fun coin paired with USDC

> Audience: developers who already understand the V1 SOL-pair launch flow (see [tutorial 01](01-create-token.md)) and want to add USDC quote-mint support.
>
> Rolled out: **2026-05-21** — pump.fun enabled USDC as a quote mint for create + trade.
>
> Estimated time: 30–60 minutes for a first end-to-end devnet launch + buy + sell.

## TL;DR

1. USDC pair coins **require V2 instructions** end-to-end (`create_v2` / `buy_v2` / `sell_v2`).
2. SOL pair still works with legacy instructions; V2 callers must pass `WSOL` as the quote mint.
3. The launched coin mint convention is still **suffix `pump`**. Quote mint is a separate account.
4. Verify everything on **devnet first**, then mainnet with a small budget. Build idempotent flows.

```text
┌──────────────────┐    ┌────────────────────┐    ┌─────────────────────────┐
│  Deployer wallet │───▶│  create_v2  (V2)   │───▶│  Curve (quote = USDC)   │
│  (funded SOL +   │    │  mint    = vanity  │    │  bonding curve + vault  │
│   maybe USDC)    │    │  quoteMint = USDC  │    │  in USDC                │
└──────────────────┘    └────────────────────┘    └────────────┬────────────┘
                                                                 │
                                                                 │  buy_v2 / sell_v2
                                                                 ▼
                                                       Trader (USDC ATA)
```

## What changed on 2026-05-21

Pump.fun enabled **USDC** as a quote mint for creating and trading pump coins. The authoritative spec lives at [pump-fun/pump-public-docs](https://github.com/pump-fun/pump-public-docs). The four rules to internalise:

1. **USDC-paired coins can only be traded via V2 instructions.** Legacy `buy` / `sell` will reject them with a program error.
2. **SOL-paired coins still trade in native SOL**, but V2 callers must pass the **wrapped SOL** mint (`So11111111111111111111111111111111111111112`).
3. **Legacy instructions continue to work** for SOL-paired coins — no forced migration.
4. **Creator fees** for USDC pair coins accrue in USDC and require [V2 `collect_creator_fee`](47-v2-creator-fees.md).

If your code only launches with SOL today, you don't have to migrate — but any new USDC-quote work is V2 end-to-end.

## Quote mints

| Asset | Mint | Decimals | Notes |
|---|---|---|---|
| USDC (mainnet) | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | 6 | Circle USDC — production |
| USDC (devnet) | `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr` | 6 | **Verify before use** — devnet USDC is a separate mint and changes from time to time |
| Wrapped SOL | `So11111111111111111111111111111111111111112` | 9 | Required as quote mint in V2 SOL-pair calls |

Always **pass the quote mint explicitly**. Don't infer it from the coin mint or from launcher intent — it's a real account the V2 instruction reads + validates.

## Prerequisites

```bash
# Already in this repo
node --version          # >= 20
solana --version        # any recent
solana-keygen --version # any recent
npm install             # bootstraps workspaces

# Configure RPC
export SOLANA_RPC_URL="https://devnet.helius-rpc.com/?api-key=…"   # or your RPC

# Confirm SDK version exposes V2 builders
node -e "console.log(require('@nirholas/pump-sdk/package.json').version)"
```

You also need:

- A funded deployer keypair on the network you're targeting.
- For devnet: ~1 SOL of devnet SOL (`solana airdrop 1 --url devnet`) plus a devnet USDC balance if you want to test buys/sells.
- For mainnet: ~0.05 SOL for tx fees + your launch budget in USDC.

## Step 1 — Grind a launch mint

Pump.fun's mint convention has historically required the launched coin's mint address to end in `pump`. The V2 `create` instruction inherits this constraint at the time of writing — **always verify against [pump-public-docs](https://github.com/pump-fun/pump-public-docs) before grinding**, since the program can change.

```bash
# Standard pump-suffix launch mint (case-sensitive)
bash tools/generate-vanity.sh --suffix pump <YourPrefix>
```

Estimated grind time (4-byte case-sensitive prefix + 4-byte suffix on 4 average cores): **30 min – 4 hr**. For shorter pure-suffix grinds (`pump` only), expect seconds.

The wrapper writes to the current working directory with mode `600` and prints the pubkey. Move it into a scratch dir so it isn't accidentally committed:

```bash
mkdir -p tmp/usdc-launch
mv ./<prefix>*pump.json tmp/usdc-launch/
ls -la tmp/usdc-launch/   # confirm mode 600
```

Verify the keypair:

```bash
npx tsx tools/verify-keypair.ts tmp/usdc-launch/<filename>.json
bash tools/check-file-permissions.sh tmp/usdc-launch
```

## Step 2 — Pick the quote mint

```typescript
// src/quote-mint.ts
import { PublicKey } from '@solana/web3.js';

export const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
export const USDC_MAINNET = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
export const USDC_DEVNET  = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');

export type PairChoice = 'SOL' | 'USDC';

export function pickQuoteMint(
  pair: PairChoice,
  network: 'mainnet-beta' | 'devnet',
): PublicKey {
  if (pair === 'SOL') return WSOL_MINT;
  return network === 'mainnet-beta' ? USDC_MAINNET : USDC_DEVNET;
}
```

## Step 3 — Build the V2 create instruction

The exact instruction name and arg shape come from `@nirholas/pump-sdk`. Read the SDK's types directly — they're the source of truth as the program evolves:

```bash
# Discover V2 exports
grep -rE "export (function|const|class) .*V2" node_modules/@nirholas/pump-sdk/dist | head
```

A representative V2 create call:

```typescript
// scripts/launch-usdc.ts
import {
  Connection,
  Keypair,
  Transaction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import { buildCreateV2Ix } from '@nirholas/pump-sdk'; // verify exact export name
import { pickQuoteMint } from './quote-mint.js';

const NETWORK = (process.env.NETWORK ?? 'devnet') as 'mainnet-beta' | 'devnet';
const PAIR    = (process.env.PAIR ?? 'USDC') as 'SOL' | 'USDC';

function loadKp(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function main() {
  const connection = new Connection(process.env.SOLANA_RPC_URL!, 'confirmed');
  const payer = loadKp(process.env.DEPLOYER_KEYPAIR!);
  const mint  = loadKp(process.env.MINT_KEYPAIR!);

  const quoteMint = pickQuoteMint(PAIR, NETWORK);

  // Bump compute budget for safety — V2 create is heavier than V1
  const cuLimit = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });
  const cuPrice = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 });

  const ix = await buildCreateV2Ix({
    payer:     payer.publicKey,
    mint:      mint.publicKey,
    quoteMint,
    name:      process.env.COIN_NAME   ?? 'My Coin',
    symbol:    process.env.COIN_SYMBOL ?? 'MYC',
    uri:       process.env.COIN_URI    ?? 'https://example.com/metadata.json',
    // creator-fee + sharing fields per the public-docs spec (see tutorial 47)
  });

  const tx = new Transaction().add(cuLimit, cuPrice, ix);

  // Pre-flight: simulate first, so we don't burn fees on a bad payload
  const sim = await connection.simulateTransaction(tx, [payer, mint]);
  if (sim.value.err) {
    console.error('Simulation failed:', sim.value.err);
    console.error('Logs:', sim.value.logs);
    process.exit(1);
  }

  const sig = await sendAndConfirmTransaction(connection, tx, [payer, mint], {
    commitment: 'confirmed',
    maxRetries: 3,
  });
  console.log('Launched:', sig);
  console.log(`Explorer: https://solscan.io/tx/${sig}${NETWORK === 'devnet' ? '?cluster=devnet' : ''}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Run with:

```bash
DEPLOYER_KEYPAIR=./tmp/usdc-launch/deployer.json \
MINT_KEYPAIR=./tmp/usdc-launch/<vanity>.json \
NETWORK=devnet PAIR=USDC \
COIN_NAME="My Coin" COIN_SYMBOL=MYC \
COIN_URI=https://example.com/metadata.json \
SOLANA_RPC_URL=https://api.devnet.solana.com \
npx tsx scripts/launch-usdc.ts
```

If `buildCreateV2Ix` doesn't exist in your installed version, bump the SDK and check the export name:

```bash
npm install @nirholas/pump-sdk@latest
grep -rE "export (function|const) buildCreate" node_modules/@nirholas/pump-sdk/dist
```

### Common simulation errors

| Error log fragment | Likely cause | Fix |
|---|---|---|
| `0x1771` (custom program error) | Mint suffix doesn't match the program's vanity constraint | Re-grind with `--suffix pump` |
| `0x1772` | Quote mint not in allowlist | Pass `USDC_MAINNET` / `USDC_DEVNET` exactly — case matters |
| `AccountNotFound` | Mint or quote mint ATA missing | The V2 create ix expects the program to init ATAs; if your SDK build requires pre-init, do it before |
| `InsufficientFundsForRent` | Deployer SOL too low to rent-exempt the new accounts | Top up the deployer with ~0.02 SOL |
| `Transaction too large` | You bundled too many ixs | Drop preflight ixs or split into two txs |

## Step 4 — Trading the new coin

All trades against a USDC-paired coin **must** use V2 `buy` / `sell`. The V2 entry points take the same `quoteMint` argument — pass `USDC_MAINNET` (or devnet variant) for USDC pairs.

```typescript
// scripts/buy-usdc.ts
import { buildBuyV2Ix } from '@nirholas/pump-sdk';

const buyIx = await buildBuyV2Ix({
  buyer:       wallet.publicKey,
  mint:        coinMint,
  quoteMint:   USDC_MAINNET,
  quoteAmount: 1_000_000n,     // 1 USDC (6 decimals)
  // Slippage guard — see tutorial 51 for modeling
  minTokensOut: applySlippageBps(expectedOut, 100), // 1% slippage
});
```

The mirror sell:

```typescript
import { buildSellV2Ix } from '@nirholas/pump-sdk';

const sellIx = await buildSellV2Ix({
  seller:       wallet.publicKey,
  mint:         coinMint,
  quoteMint:    USDC_MAINNET,
  tokenAmount:  1_000_000_000n,
  minQuoteOut:  applySlippageBps(expectedQuote, 100),
});
```

Don't reach for the legacy buy instruction — it will fail with `0x178a` (or similar) against a USDC-paired curve.

## Step 5 — Confirm on chain

After the transaction confirms:

```bash
solana confirm -v <signature> --url $SOLANA_RPC_URL

# Inspect the curve account
solana account <curve-pda> --url $SOLANA_RPC_URL --output json | jq .
```

Things to verify:

- The curve's `quote_mint` field matches what you passed.
- The curve's `bonding_curve_state` is initialized (not zeroed).
- A token account exists for the deployer's initial allocation (if your launch reserves any).

## Step 6 — Monitor the launch

PumpKit already has launch monitoring in `@pumpkit/core` ([packages/core/src/monitor/LaunchMonitor.ts](../packages/core/src/monitor/LaunchMonitor.ts)). To filter for USDC-pair launches specifically:

```typescript
import { LaunchMonitor } from '@pumpkit/core';

const monitor = new LaunchMonitor({
  rpcUrl: process.env.SOLANA_RPC_URL!,
  onLaunch: async (event) => {
    if (event.quoteMint.equals(USDC_MAINNET)) {
      console.log('USDC launch:', event.mint.toBase58(), 'creator:', event.creator.toBase58());
      // Forward to bot, write to DB, etc.
    }
  },
});

await monitor.start();
```

The event-monitor and channel bot use **typed V2 event decoders** (see recent commits `1bfec69`, `54768bc`) — use those files as the working reference.

## Step 7 — Funding-source check (before announcing)

If you're running a campaign or expecting users to follow the deployer, confirm the deployer wasn't pump-seeded (otherwise it'll surface as a leaked-launch in monitors):

```bash
npx tsx tools/check-pump-funding.ts <deployer-pubkey>
```

A clean deployer should report **NOT seeded by pump** for an organic launch.

## Production checklist

Before mainnet:

- [ ] Devnet end-to-end succeeded (create → buy → sell → close)
- [ ] Mint keypair backed up + encrypted (use `tools/generate-vanity.sh -e -b`)
- [ ] Deployer keypair backed up off-machine
- [ ] Deployer has 0.05+ SOL for fees + retries
- [ ] Quote-mint pubkey is the **mainnet** USDC, not devnet
- [ ] Slippage guards (`minTokensOut` / `minQuoteOut`) tuned for your expected trade size — see [tutorial 51](51-slippage-modeling-v2.md)
- [ ] Monitor running so you catch the on-chain event for your own launch
- [ ] Tested SDK version pinned in `package.json` (not floating `*`)

## Common pitfalls

- **Calling legacy `buy` on a USDC pair.** Fails with a program error; switch to V2.
- **Passing the coin mint as `quoteMint`.** The quote mint is the pair currency (USDC or WSOL), never the launched coin.
- **Assuming a `pump` suffix is mandatory under V2.** Check the program's constraint before spending CPU on the grind.
- **Forgetting that SOL-pair V2 calls still need WSOL passed.** Even though trades settle in native SOL.
- **Devnet testing.** Devnet USDC is a different mint and the V2 program may not be deployed there — verify with `solana program show <PROGRAM_ID> --url devnet`.
- **Floating SDK version.** Pin `@nirholas/pump-sdk` to a specific minor while the V2 surface is still moving.
- **Burning the mint keypair on a failed first attempt.** A simulated-failed create doesn't burn the keypair — re-use it. Only burn after the first **confirmed** tx.

## See also

- Skill: [.claude/skills/launch-usdc-pair/SKILL.md](../.claude/skills/launch-usdc-pair/SKILL.md)
- Next tutorial: [tutorials/47-v2-creator-fees.md](47-v2-creator-fees.md) — V2 creator-fee collection + sharing
- Companion: [tutorials/48-usdc-trading-bot.md](48-usdc-trading-bot.md) — building an end-to-end USDC pump.fun trading bot
- Companion: [tutorials/51-slippage-modeling-v2.md](51-slippage-modeling-v2.md) — modeling slippage on V2 curves
- Companion: [tutorials/52-v1-to-v2-migration.md](52-v1-to-v2-migration.md) — audit-and-migrate playbook for existing callers
- Authoritative protocol docs: [pump-fun/pump-public-docs](https://github.com/pump-fun/pump-public-docs)
- Earlier vanity coverage: [tutorials/13-vanity-addresses.md](13-vanity-addresses.md), [tutorials/31-rust-vanity-deep-dive.md](31-rust-vanity-deep-dive.md)
