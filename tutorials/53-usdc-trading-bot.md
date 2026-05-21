# Tutorial 53 — Building an end-to-end USDC pump.fun trading bot

> Audience: developers who finished [tutorial 46](46-usdc-pair-launches.md) and want a complete bot that monitors USDC launches and auto-trades them.
>
> **Strong caveat:** This is a reference architecture for educational purposes. Live trading is risky. Test on devnet, paper-trade on mainnet, and only deploy capital you can afford to lose.

## Architecture

```text
            ┌──────────────────────────────────────────┐
            │       LaunchMonitor (V2, USDC filter)    │
            │  rpc websocket -> typed V2 event decode  │
            └────────────────────┬─────────────────────┘
                                 │  TradeSignal
                                 ▼
            ┌──────────────────────────────────────────┐
            │             Strategy module              │
            │  rules: cap, vol-threshold, blocklist,   │
            │  position size, slippage tolerance       │
            └────────────────────┬─────────────────────┘
                                 │  ExecutionPlan
                                 ▼
            ┌──────────────────────────────────────────┐
            │           Executor (V2 buy/sell)         │
            │  preflight sim -> send -> confirm        │
            │  retry w/ priority-fee bump on fail      │
            └────────────────────┬─────────────────────┘
                                 │  Fill
                                 ▼
            ┌──────────────────────────────────────────┐
            │             PositionTracker              │
            │  open positions, PnL, exit triggers      │
            └────────────────────┬─────────────────────┘
                                 │  Notification
                                 ▼
            ┌──────────────────────────────────────────┐
            │          Telegram (grammY bot)           │
            └──────────────────────────────────────────┘
```

We'll reuse PumpKit's existing primitives:

- [`@pumpkit/core`](../packages/core/) — `LaunchMonitor`, `formatClaim`, `createBot`, storage
- [`@nirholas/pump-sdk`](https://www.npmjs.com/package/@nirholas/pump-sdk) — V2 instruction builders + typed event decoders

## Project layout

```text
my-usdc-bot/
├── src/
│   ├── strategy.ts        # rule engine
│   ├── executor.ts        # buy/sell with retries
│   ├── positions.ts       # in-memory + sqlite store
│   ├── monitor.ts         # USDC-filtered LaunchMonitor wiring
│   └── index.ts           # boot
├── .env.example
├── package.json
└── tsconfig.json
```

## Step 1 — Boot and wire dependencies

```typescript
// src/index.ts
import 'dotenv/config';
import { Connection, Keypair } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import { createBot, LaunchMonitor, SqliteStore, createHealthServer } from '@pumpkit/core';
import { startMonitor } from './monitor.js';
import { Executor } from './executor.js';
import { PositionTracker } from './positions.js';
import { Strategy } from './strategy.js';

const loadKp = (p: string) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, 'utf8'))));

async function main() {
  const wallet     = loadKp(process.env.WALLET_KEYPAIR!);
  const connection = new Connection(process.env.SOLANA_RPC_URL!, 'confirmed');
  const store      = new SqliteStore({ path: process.env.STORE_PATH ?? './data/bot.sqlite' });
  await store.init();

  const bot = createBot({ token: process.env.TELEGRAM_BOT_TOKEN! });

  const strategy   = new Strategy({
    maxPositionUsdc: BigInt(process.env.MAX_POSITION_USDC ?? '5000000'), // 5 USDC default
    slippageBps:     Number(process.env.SLIPPAGE_BPS ?? 200),
    blocklist:       (process.env.BLOCKLIST ?? '').split(',').filter(Boolean),
  });

  const executor  = new Executor({ connection, wallet });
  const positions = new PositionTracker({ store, bot, chatId: process.env.TELEGRAM_CHAT_ID! });

  createHealthServer({ port: Number(process.env.HEALTH_PORT ?? 3000) });
  await startMonitor({ connection, strategy, executor, positions });
  bot.launch();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

## Step 2 — Monitor (USDC filter)

```typescript
// src/monitor.ts
import { Connection, PublicKey } from '@solana/web3.js';
import { LaunchMonitor } from '@pumpkit/core';
import type { Executor } from './executor.js';
import type { Strategy } from './strategy.js';
import type { PositionTracker } from './positions.js';

const USDC_MAINNET = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

interface Deps {
  connection: Connection;
  strategy: Strategy;
  executor: Executor;
  positions: PositionTracker;
}

export async function startMonitor({ connection, strategy, executor, positions }: Deps) {
  const monitor = new LaunchMonitor({
    rpcUrl: connection.rpcEndpoint,
    onLaunch: async (event) => {
      if (!event.quoteMint.equals(USDC_MAINNET)) return;

      const decision = strategy.evaluate(event);
      if (decision.action === 'skip') return;

      try {
        const fill = await executor.buy({
          mint:         event.mint,
          quoteMint:    USDC_MAINNET,
          quoteAmount:  decision.size,
          slippageBps:  decision.slippageBps,
        });
        await positions.opened({ event, fill });
      } catch (err) {
        await positions.error(event, err);
      }
    },
  });

  await monitor.start();
}
```

## Step 3 — Strategy (rules, not magic)

The strategy is intentionally **boring** — explicit thresholds, no ML, no signals service. Start dumb. You can layer indicators later if the dumb bot is profitable.

```typescript
// src/strategy.ts
import type { LaunchEvent } from '@pumpkit/core';

export interface Decision {
  action: 'buy' | 'skip';
  size: bigint;
  slippageBps: number;
  reason: string;
}

export class Strategy {
  constructor(private cfg: {
    maxPositionUsdc: bigint;
    slippageBps: number;
    blocklist: string[];
  }) {}

  evaluate(event: LaunchEvent): Decision {
    const creator = event.creator.toBase58();

    if (this.cfg.blocklist.includes(creator)) {
      return { action: 'skip', size: 0n, slippageBps: 0, reason: 'creator blocklisted' };
    }

    // Reject launches where the symbol/name screams scam — simple substring filter
    const symbol = event.symbol.toLowerCase();
    if (symbol.includes('rug') || symbol.includes('test')) {
      return { action: 'skip', size: 0n, slippageBps: 0, reason: `symbol filter: ${symbol}` };
    }

    return {
      action:      'buy',
      size:        this.cfg.maxPositionUsdc,
      slippageBps: this.cfg.slippageBps,
      reason:      'passes filters',
    };
  }

  evaluateExit(opened: { entryPrice: bigint; entryTime: number; mint: string }, current: bigint): Decision {
    const elapsedMs = Date.now() - opened.entryTime;
    const profitBps = (current - opened.entryPrice) * 10_000n / opened.entryPrice;

    if (profitBps >= 5000n) {
      return { action: 'buy', size: 0n, slippageBps: 300, reason: 'take profit +50%' }; // sell encoded elsewhere
    }
    if (profitBps <= -3000n) {
      return { action: 'buy', size: 0n, slippageBps: 500, reason: 'stop loss -30%' };
    }
    if (elapsedMs > 30 * 60 * 1000) {
      return { action: 'buy', size: 0n, slippageBps: 300, reason: '30min timeout' };
    }
    return { action: 'skip', size: 0n, slippageBps: 0, reason: 'hold' };
  }
}
```

## Step 4 — Executor (with retries + priority fee bump)

```typescript
// src/executor.ts
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { buildBuyV2Ix, buildSellV2Ix } from '@nirholas/pump-sdk';

interface BuyArgs {
  mint: PublicKey;
  quoteMint: PublicKey;
  quoteAmount: bigint;
  slippageBps: number;
}

export class Executor {
  constructor(private deps: { connection: Connection; wallet: Keypair }) {}

  async buy(args: BuyArgs) {
    return this.send(args, 'buy');
  }

  async sell(args: BuyArgs & { tokenAmount: bigint }) {
    return this.send(args, 'sell');
  }

  private async send(args: any, kind: 'buy' | 'sell') {
    const { connection, wallet } = this.deps;

    let attempt = 0;
    let priorityFeeMicrolamports = 50_000;

    while (attempt < 3) {
      attempt++;

      const ix = kind === 'buy'
        ? await buildBuyV2Ix({
            buyer:        wallet.publicKey,
            mint:         args.mint,
            quoteMint:    args.quoteMint,
            quoteAmount:  args.quoteAmount,
            minTokensOut: 0n, // populate from a quote — see tutorial 51
          })
        : await buildSellV2Ix({
            seller:      wallet.publicKey,
            mint:        args.mint,
            quoteMint:   args.quoteMint,
            tokenAmount: args.tokenAmount,
            minQuoteOut: 0n,
          });

      const tx = new Transaction()
        .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }))
        .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFeeMicrolamports }))
        .add(ix);

      try {
        const sig = await sendAndConfirmTransaction(connection, tx, [wallet], {
          commitment: 'confirmed',
          maxRetries: 0,
        });
        return { sig, attempt, priorityFeeMicrolamports };
      } catch (err: any) {
        // Bump priority fee and retry on confirmation timeout / blockhash issues
        const msg = String(err?.message ?? err);
        if (msg.includes('blockhash') || msg.includes('not confirmed')) {
          priorityFeeMicrolamports = Math.min(priorityFeeMicrolamports * 3, 5_000_000);
          continue;
        }
        throw err;
      }
    }
    throw new Error('exhausted retries');
  }
}
```

## Step 5 — Position tracker

```typescript
// src/positions.ts
import type { Bot } from '@pumpkit/core';
import type { SqliteStore } from '@pumpkit/core';

export class PositionTracker {
  constructor(private deps: { store: SqliteStore; bot: Bot; chatId: string }) {}

  async opened({ event, fill }: any) {
    await this.deps.store.set(`position:${event.mint.toBase58()}`, {
      mint:       event.mint.toBase58(),
      entrySig:   fill.sig,
      entryTime:  Date.now(),
      quoteAmount: String(event.quoteAmount ?? 0),
    });
    await this.deps.bot.send(this.deps.chatId, `🟢 opened ${event.symbol} (${event.mint.toBase58().slice(0, 8)}…)`);
  }

  async closed({ mint, exitSig, pnl }: any) {
    await this.deps.store.delete(`position:${mint}`);
    await this.deps.bot.send(this.deps.chatId, `🔴 closed ${mint.slice(0, 8)}… pnl=${pnl}`);
  }

  async error(event: any, err: unknown) {
    await this.deps.bot.send(this.deps.chatId, `⚠️ ${event.symbol} error: ${(err as Error).message}`);
  }
}
```

## Step 6 — Paper-trade mode

Before risking real USDC, run in **paper-trade mode** for 24–48 hours. Swap `Executor.buy/sell` for a no-op that records the intended action:

```typescript
export class PaperExecutor extends Executor {
  async buy(args: any) {
    console.log('[paper] would buy', args);
    return { sig: 'paper', attempt: 1, priorityFeeMicrolamports: 0 };
  }
  async sell(args: any) {
    console.log('[paper] would sell', args);
    return { sig: 'paper', attempt: 1, priorityFeeMicrolamports: 0 };
  }
}
```

Set `PAPER_TRADE=1` in `.env` and gate the swap at boot. Review your paper log alongside on-chain prices to see if your strategy would have made or lost money.

## Step 7 — Deployment

The project ships Docker support for the existing bots ([Makefile](../Makefile) `docker-monitor`, `docker-tracker`). Mirror that for your bot:

```dockerfile
# Dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
USER node
CMD ["node", "dist/index.js"]
```

Run on Railway / Fly / your VPS. Ensure:

- `WALLET_KEYPAIR` is **not** in the image — mount it via secret volume.
- Health endpoint (`/healthz`) is reachable for the platform's liveness probe.
- RPC URL is a paid one with reasonable rate limits — free public RPCs will throttle and you'll miss launches.

## Operational lessons

- **Latency matters.** A 500ms slower launch detection often means a worse fill. Use a Geyser stream ([tutorial 49](49-indexing-v2-events.md)) instead of public RPC websockets if you're serious.
- **Backoff on RPC errors.** Don't retry every 10ms — you'll get rate-limited and miss the next launch.
- **Watch your wallet's USDC balance.** A bot that runs out of USDC will keep computing decisions and never execute. Add a balance check at startup and every N minutes.
- **Pre-compute ATAs.** The first buy on a new coin creates an ATA — if you race the ATA-init, two parallel buys can both try and one will fail. Either pre-init or use idempotent ATA instructions in the same tx.
- **Log everything.** Use [@pumpkit/core](../packages/core/) logger with `LOG_LEVEL=debug` while tuning; demote to `info` in prod.
- **Never persist private keys.** Keep them as keypair JSONs with mode `600`, loaded at boot. Never write them to the SQLite store, never echo into Telegram.

## Risk disclosures

This tutorial is **reference architecture**, not financial advice. Things that will lose you money include — but are absolutely not limited to — RPC outages, MEV ([tutorial 50](50-mev-defense-patterns.md)), slippage you under-modelled ([tutorial 51](51-bonding-curve-internals.md)), creator rugs, sniper bots, and bugs in this very tutorial. Trade small until you understand the failure modes.

## See also

- [tutorials/46-usdc-pair-launches.md](46-usdc-pair-launches.md) — what the bot is buying
- [tutorials/47-v2-creator-fees.md](47-v2-creator-fees.md) — fees that accrue on your buys/sells
- [tutorials/48-jito-bundle-strategies.md](48-jito-bundle-strategies.md) — atomic execute-or-revert
- [tutorials/49-rpc-resilience.md](49-rpc-resilience.md) — RPC failover so the bot doesn't go dark
- [tutorials/50-mev-defense-patterns.md](50-mev-defense-patterns.md) — MEV defence
- [tutorials/51-bonding-curve-internals.md](51-bonding-curve-internals.md) — curve math underpinning fills
- [tutorials/54-indexing-v2-events.md](54-indexing-v2-events.md) — faster event ingestion at scale
- [tutorials/11-trading-bot.md](11-trading-bot.md) — the V1 SOL-pair predecessor
- [docs/rpc-best-practices.md](../docs/rpc-best-practices.md) — RPC choice + tuning
