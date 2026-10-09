# Tutorial 46 — Launch a pump.fun coin paired with USDC

> Audience: developers who already understand the V1 SOL-pair launch flow (see [tutorial 01](01-create-token.md)) and want to add USDC quote-mint support.
>
> Rolled out: **2026-05-21** — pump.fun enabled USDC as a quote mint for create + trade.
>
> Estimated time: 30–60 minutes for a first end-to-end devnet launch + buy + sell.

## TL;DR

1. USDC pair coins are created with `create_v2` and traded with the quote-aware instructions only: `buy_v3` / `sell_v3` / `buy_exact_quote_in_v3` (October 2026, preferred) or `buy_v2` / `sell_v2`. Legacy `buy` / `sell` reject them.
2. SOL pair still works with legacy instructions; V2 and V3 callers must pass `WSOL` as the quote mint.
3. Since October 2026 the quote can also be **another pump coin** (see [Step 3b](#step-3b-pair-with-a-pump-coin-october-2026)).
4. The launched coin mint convention is still **suffix `pump`**. Quote mint is a separate account.
5. Verify everything on **devnet first**, then mainnet with a small budget. Build idempotent flows.

```text
┌──────────────────┐    ┌────────────────────┐    ┌─────────────────────────┐
│  Deployer wallet │───▶│  create_v2  (V2)   │───▶│  Curve (quote = USDC)   │
│  (funded SOL +   │    │  mint    = vanity  │    │  bonding curve + vault  │
│   maybe USDC)    │    │  quoteMint = USDC  │    │  in USDC                │
└──────────────────┘    └────────────────────┘    └────────────┬────────────┘
                                                                 │
                                                                 │  buy_v3 / sell_v3 (or v2)
                                                                 ▼
                                                       Trader (USDC ATA)
```

## What changed on 2026-05-21

Pump.fun enabled **USDC** as a quote mint for creating and trading pump coins. The authoritative spec lives at [pump-fun/pump-public-docs](https://github.com/pump-fun/pump-public-docs). The four rules to internalise:

1. **USDC-paired coins can only be traded via the quote-aware instructions** (`buy_v2` / `sell_v2`, and since October 2026 `buy_v3` / `sell_v3`). Legacy `buy` / `sell` will reject them with a program error.
2. **SOL-paired coins still trade in native SOL**, but V2 callers must pass the **wrapped SOL** mint (`So11111111111111111111111111111111111111112`).
3. **Legacy instructions continue to work** for SOL-paired coins — no forced migration.
4. **Creator fees** for USDC pair coins accrue in USDC and require [V2 `collect_creator_fee`](47-v2-creator-fees.md). Fees from v3 trades wait on the curve until `sweep_creator_fee` moves them into the creator vault, so sweep before you collect.

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

# Install the official SDK (4.0.0 has the v3 trades, sweeps and pump-coin quotes)
npm install @pump-fun/pump-sdk@^4.0.0 @solana/web3.js @solana/spl-token bn.js
node -e "console.log(require('@pump-fun/pump-sdk/package.json').version)"
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

`@pump-fun/pump-sdk` builds `create_v2` for any quote mint. `OnlinePumpSdk.resolveQuoteMint` checks that the program accepts the mint right now and returns its token program and decimals, which the builder needs to derive the quote-side token accounts.

```typescript
// scripts/launch-usdc.ts
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import { OnlinePumpSdk, PUMP_SDK } from '@pump-fun/pump-sdk';
import { pickQuoteMint } from '../src/quote-mint.js';

const NETWORK = (process.env.NETWORK ?? 'devnet') as 'mainnet-beta' | 'devnet';
const PAIR    = (process.env.PAIR ?? 'USDC') as 'SOL' | 'USDC';

function loadKp(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function main() {
  const connection = new Connection(process.env.SOLANA_RPC_URL!, 'confirmed');
  const online = new OnlinePumpSdk(connection);
  const payer = loadKp(process.env.DEPLOYER_KEYPAIR!);
  const mint  = loadKp(process.env.MINT_KEYPAIR!);

  // QUOTE_MINT overrides the pair: set it to an existing pump coin to pair with that coin
  const requested = process.env.QUOTE_MINT
    ? new PublicKey(process.env.QUOTE_MINT)
    : pickQuoteMint(PAIR, NETWORK);

  // Throws UnsupportedQuoteMintError when create_v2 would refuse the mint.
  // A pump coin resolves with source 'pumpCoin' and the extra accounts create_v2 needs.
  const quote = await online.resolveQuoteMint(requested);
  console.log(`Quote ${quote.mint.toBase58()} (${quote.source}, ${quote.decimals} decimals)`);

  const cuLimit = ComputeBudgetProgram.setComputeUnitLimit({ units: quote.pumpQuote ? 400_000 : 250_000 });
  const cuPrice = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 });

  const ix = await PUMP_SDK.createV2Instruction({
    mint:       mint.publicKey,
    name:       process.env.COIN_NAME   ?? 'My Coin',
    symbol:     process.env.COIN_SYMBOL ?? 'MYC',
    uri:        process.env.COIN_URI    ?? 'https://example.com/metadata.json',
    creator:    payer.publicKey,
    user:       payer.publicKey,
    mayhemMode: false,
    quoteMint:         quote.mint,
    quoteTokenProgram: quote.quoteTokenProgram,
    pumpQuote:         quote.pumpQuote?.accounts,
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

Checked against mainnet in October 2026: `resolveQuoteMint` returns USDC as source `global` with 6 decimals and the SPL Token program.

## Step 3b: Pair with a pump coin (October 2026)

`create_v2` can also pair the new coin with an **existing pump coin Q** instead of SOL or USDC. Set `QUOTE_MINT=<Q's mint>` and run the same script: `resolveQuoteMint` returns source `pumpCoin` and `pumpQuote.accounts`, which `createV2Instruction` appends as the extra remaining accounts (Q's bonding curve, plus its PumpSwap pool and vaults once Q has migrated). Rules from the [protocol spec](../docs/pump-protocol/instructions/CREATE_WITH_PUMP_COIN_QUOTE.md):

- Q must itself be paired with SOL, USDC or another listed quote. A coin quoted in a pump coin cannot be a quote yet (`CurveDepthExceeded`, 6105). `pumpQuote.depth` is the depth the new coin gets.
- Neither Q nor the new coin can be in mayhem mode (6100, 6071).
- If Q's curve is complete but its pool does not exist yet, creation fails with `QuoteCurveAwaitingMigration` (6107). Retry after `migrate_v2`.
- The starting `virtual_quote_reserves` are computed from Q's live reserves, so the new coin raises about as much as a normal launch, counted in Q. `CreateEvent.virtual_quote_reserves` reports it.
- Every amount on the new coin (trade amounts, fees, reserves, creator fees) is in Q's base units, not lamports. Pump coins created with `create_v2` are Token-2022 with 6 decimals.
- To buy the new coin straight from SOL or USDC, use `multi_hop_swap` with Q's curve or pool as the first hop (see [tutorial 55](55-october-2026-trade-upgrade.md#5-multi-hop-swaps)).

### Common simulation errors

| Error log fragment | Likely cause | Fix |
|---|---|---|
| `0x1771` (custom program error) | Mint suffix doesn't match the program's vanity constraint | Re-grind with `--suffix pump` |
| `0x1772` | Quote mint not in allowlist | Pass `USDC_MAINNET` / `USDC_DEVNET` exactly — case matters |
| `AccountNotFound` | Mint or quote mint ATA missing | The V2 create ix expects the program to init ATAs; if your SDK build requires pre-init, do it before |
| `InsufficientFundsForRent` | Deployer SOL too low to rent-exempt the new accounts | Top up the deployer with ~0.02 SOL |
| `Transaction too large` | You bundled too many ixs | Drop preflight ixs or split into two txs |
| `UnsupportedQuoteMint` (6063) | The quote mint is not listed and is not a pump coin | Use a mint `online.fetchSupportedQuoteMints()` returns, or a pump coin |
| `CurveDepthExceeded` (6105) / `QuoteCurveAwaitingMigration` (6107) | Pump-coin quote not eligible yet | See Step 3b |

## Step 4 — Trading the new coin

Trades against a USDC-paired (or pump-coin-paired) coin **must** name the quote mint. Use the October 2026 v3 instructions: they price exactly like `buy_v2` / `sell_v2` but keep the protocol and creator fee on the curve for a later sweep, and the buy that empties the curve keeps going into the pool-to-be (synthetic migration) instead of failing. `fetchBuyState` / `fetchSellState` read the curve's stored quote mint and its token program, so you do not pass USDC again here.

```typescript
// scripts/trade-usdc.ts
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';
import {
  OnlinePumpSdk,
  PUMP_SDK,
  getBuyV3TokenAmountFromQuoteAmount,
  getSellSolAmountFromTokenAmount,
} from '@pump-fun/pump-sdk';

export async function buyWithQuote(connection: Connection, wallet: Keypair, mint: PublicKey, quoteAmount: BN) {
  const online = new OnlinePumpSdk(connection);
  const [global, feeConfig, state] = await Promise.all([
    online.fetchGlobal(),
    online.fetchFeeConfig(),
    online.fetchBuyState(mint, wallet.publicKey, TOKEN_2022_PROGRAM_ID),
  ]);

  // quoteAmount is in the quote mint's base units: 1_000_000 = 1 USDC
  const tokensOut = getBuyV3TokenAmountFromQuoteAmount({
    global,
    feeConfig,
    mintSupply: state.bondingCurve.tokenTotalSupply,
    bondingCurve: state.bondingCurve,
    amount: quoteAmount,
    curveBaseTokenBalance: state.curveBaseTokenBalance,
  });

  const instructions = await PUMP_SDK.buyExactQuoteInV3Instructions({
    bondingCurve: state.bondingCurve,
    associatedUserAccountInfo: state.associatedUserAccountInfo,
    mint,
    user: wallet.publicKey,
    amount: tokensOut,
    quoteAmount,
    slippage: 1, // percent
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    quoteTokenProgram: state.quoteTokenProgram,
  });

  return sendAndConfirmTransaction(connection, new Transaction().add(...instructions), [wallet]);
}

export async function sellForQuote(connection: Connection, wallet: Keypair, mint: PublicKey, amount: BN) {
  const online = new OnlinePumpSdk(connection);
  const [global, feeConfig, state] = await Promise.all([
    online.fetchGlobal(),
    online.fetchFeeConfig(),
    online.fetchSellState(mint, wallet.publicKey, TOKEN_2022_PROGRAM_ID),
  ]);

  const quoteOut = getSellSolAmountFromTokenAmount({
    global,
    feeConfig,
    mintSupply: state.bondingCurve.tokenTotalSupply,
    bondingCurve: state.bondingCurve,
    amount,
  });

  const instructions = await PUMP_SDK.sellV3Instructions({
    bondingCurve: state.bondingCurve,
    mint,
    user: wallet.publicKey,
    amount,
    quoteAmount: quoteOut,
    slippage: 1,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    quoteTokenProgram: state.quoteTokenProgram,
  });

  return sendAndConfirmTransaction(connection, new Transaction().add(...instructions), [wallet]);
}
```

- `quoteAmount` and the returned amounts are in the quote mint's base units: `1_000_000n` is 1 USDC (6 decimals), not 0.001 SOL.
- Cashback coins refuse v3 (`CashbackCoinNotSupported`, 6094). For those, use `PUMP_SDK.buyV2Instructions` / `sellV2Instructions` with the same state.
- The trader needs a token account for the quote mint. `sellV3Instructions` creates the seller's when it is missing; for buys, fund the wallet's USDC account first.
- After graduation the coin trades on PumpSwap; `@pump-fun/pump-swap-sdk` 2.1.0 `buyQuoteInput(..., { v2: true })` handles the USDC pool the same way (see [tutorial 34](34-amm-liquidity-operations.md#step-3b-october-2026-upgrade-v2-trades-signed-reserves-sweeps)).

Don't reach for the legacy buy instruction: it fails against a USDC-paired curve.

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

Every `create` and `create_v2` emits a `CreateEvent` whose `quote_mint` names the pair, and whose `depth` is nonzero only for a coin quoted in a pump coin. Decode it straight from the Pump program's logs with the official SDK to filter USDC and pump-coin launches:

```typescript
// scripts/watch-launches.ts
import { Connection, PublicKey } from '@solana/web3.js';
import { PUMP_PROGRAM_ID, PUMP_SDK, isSolLikeQuoteMint, type CreateEventBc } from '@pump-fun/pump-sdk';

const CREATE_EVENT = Buffer.from('1b72a94ddeeb6376', 'hex');
const USDC_MAINNET = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

export function decodeCreateEvents(logs: readonly string[]): CreateEventBc[] {
  const events: CreateEventBc[] = [];
  for (const line of logs) {
    if (!line.startsWith('Program data: ')) continue;
    const bytes = Buffer.from(line.slice('Program data: '.length), 'base64');
    if (bytes.length < 8 || !bytes.subarray(0, 8).equals(CREATE_EVENT)) continue;
    events.push(PUMP_SDK.decodeCreateEventBc(bytes.subarray(8)));
  }
  return events;
}

export function watchLaunches(connection: Connection) {
  return connection.onLogs(PUMP_PROGRAM_ID, ({ err, logs, signature }) => {
    if (err) return;
    for (const event of decodeCreateEvents(logs)) {
      if (isSolLikeQuoteMint(event.quoteMint)) continue;
      const pair = event.quoteMint.equals(USDC_MAINNET)
        ? 'USDC'
        : event.depth > 0 ? `pump coin ${event.quoteMint.toBase58()}` : event.quoteMint.toBase58();
      console.log(`${pair} launch: ${event.mint.toBase58()} by ${event.creator.toBase58()} (${signature})`);
    }
  }, 'confirmed');
}
```

`decodeCreateEventBc` takes the event body after the 8-byte discriminator and fills fields that older events lack with defaults (`creatorFeeBps` 0, `isHolderReward` false, `depth` 0). `isSolLikeQuoteMint` treats both the default key and wrapped SOL as SOL. The channel and monitor bots in this repo decode the same events (see [tutorial 43](43-understanding-pumpfun-events.md) for the discriminators).

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
- [ ] Slippage (`slippage` percent on the v3 builders) tuned for your expected trade size
- [ ] Claim flow sweeps `sweep_creator_fee` before collecting (see [tutorial 47](47-v2-creator-fees.md))
- [ ] Monitor running so you catch the on-chain event for your own launch
- [ ] Tested SDK version pinned in `package.json` (not floating `*`)

## Common pitfalls

- **Calling legacy `buy` on a USDC pair.** Fails with a program error; switch to v3 (or v2).
- **Passing the coin mint as `quoteMint`.** The quote mint is the pair currency (USDC, WSOL or the quote pump coin), never the launched coin.
- **Assuming a `pump` suffix is mandatory under V2.** Check the program's constraint before spending CPU on the grind.
- **Forgetting that SOL-pair V2 calls still need WSOL passed.** Even though trades settle in native SOL.
- **Devnet testing.** Devnet USDC is a different mint and the V2 program may not be deployed there — verify with `solana program show <PROGRAM_ID> --url devnet`.
- **Floating SDK version.** Pin `@pump-fun/pump-sdk` to `^4.0.0`; earlier versions lack the v3 trades, sweeps and pump-coin quotes.
- **Burning the mint keypair on a failed first attempt.** A simulated-failed create doesn't burn the keypair — re-use it. Only burn after the first **confirmed** tx.

## See also

- Skill: [.claude/skills/launch-usdc-pair/SKILL.md](../.claude/skills/launch-usdc-pair/SKILL.md)
- October 2026 upgrade: [tutorials/55-october-2026-trade-upgrade.md](55-october-2026-trade-upgrade.md) (v3/v2 trades, multi-hop swaps, sweeps, synthetic migration)
- Next tutorial: [tutorials/47-v2-creator-fees.md](47-v2-creator-fees.md) — V2 creator-fee collection + sharing
- Companion: [tutorials/53-usdc-trading-bot.md](53-usdc-trading-bot.md) — building an end-to-end USDC pump.fun trading bot
- Companion: [tutorials/52-v1-to-v2-migration.md](52-v1-to-v2-migration.md) — audit-and-migrate playbook for existing callers
- Authoritative protocol docs: [pump-fun/pump-public-docs](https://github.com/pump-fun/pump-public-docs)
- Earlier vanity coverage: [tutorials/13-vanity-addresses.md](13-vanity-addresses.md), [tutorials/31-rust-vanity-deep-dive.md](31-rust-vanity-deep-dive.md)
