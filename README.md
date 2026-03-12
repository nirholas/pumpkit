# PumpKit

> Open-source framework for building PumpFun Telegram bots on Solana. Claim monitors, channel feeds, group trackers, whale alerts — build your own or use ours.

## What is PumpKit?

PumpKit is a TypeScript framework and collection of production-ready bots for monitoring PumpFun activity on Solana via Telegram. It provides:

- **`@pumpkit/core`** — Shared framework: bot scaffolding, Solana monitoring, formatters, storage, config, health checks
- **`@pumpkit/monitor`** — All-in-one monitoring bot (fee claims, launches, graduations, whale trades, CTO alerts)
- **`@pumpkit/tracker`** — Group call-tracking bot (leaderboards, PNL cards, rankings, multi-chain)

## Why PumpKit?

Claim bots and PumpFun monitors are some of the most popular Telegram bots in crypto. But every builder starts from scratch — writing the same grammy setup, Solana RPC connections, message formatters, and deployment configs.

PumpKit gives you production-tested building blocks so you can ship a bot in hours, not weeks.

## Architecture

```
┌───────────────────────────────────────────────────┐
│                  @pumpkit/core                    │
│                                                   │
│  bot/       grammy scaffolding, command router    │
│  monitor/   WebSocket + HTTP event monitors       │
│  solana/    RPC client, program IDs, decoders     │
│  formatter/ HTML message builder (Telegram)       │
│  storage/   File-based + SQLite adapters          │
│  config/    Typed env loader with validation      │
│  health/    HTTP health check server              │
│  logger/    Leveled console logger                │
│  api/       REST + SSE + webhook server           │
│  social/    Twitter/X + GitHub integrations       │
│  types/     Shared event & program types          │
└──────────┬────────────────────────┬───────────────┘
           │                        │
    ┌──────▼───────┐          ┌──────▼───────┐
    │  @pumpkit/   │          │  @pumpkit/   │
    │   monitor    │          │   tracker    │
    │              │          │              │
    │ DM commands  │          │ Group calls  │
    │ Channel feed │          │ Leaderboards │
    │ REST API     │          │ PNL cards    │
    │ Webhooks     │          │ Rankings     │
    │ SSE stream   │          │ Multi-chain  │
    └──────────────┘          └──────────────┘
```

## Quick Start

### Use a pre-built bot

```bash
# Clone the repo
git clone https://github.com/pumpkit/pumpkit.git
cd pumpkit

# Install dependencies
npm install

# Configure
cp packages/monitor/.env.example packages/monitor/.env
# Edit .env with your TELEGRAM_BOT_TOKEN and SOLANA_RPC_URL

# Run the monitor bot
npm run dev --workspace=@pumpkit/monitor
```

### Build your own bot

```typescript
import { createBot, ClaimMonitor, formatClaim, createHealthServer } from '@pumpkit/core';

const bot = createBot({
  token: process.env.BOT_TOKEN!,
  commands: {
    start: (ctx) => ctx.reply('Welcome to my claim bot!'),
    help: (ctx) => ctx.reply('I monitor PumpFun fee claims.'),
  },
});

const monitor = new ClaimMonitor({
  rpcUrl: process.env.SOLANA_RPC_URL!,
  onClaim: async (event) => {
    await bot.broadcast(formatClaim(event));
  },
});

createHealthServer({ port: 3000, monitor });
monitor.start();
bot.launch();
```

## Packages

| Package | Description | Status |
|---------|-------------|--------|
| [`@pumpkit/core`](packages/core/) | Shared framework — bot, monitoring, solana, formatters, storage | 🚧 Building |
| [`@pumpkit/monitor`](packages/monitor/) | All-in-one PumpFun monitor bot (DM + channel + API) | 🚧 Building |
| [`@pumpkit/tracker`](packages/tracker/) | Group call-tracking bot with leaderboards | 🚧 Building |

## Features

### Monitor Bot (`@pumpkit/monitor`)

Consolidates 3 existing production bots into one:

| Feature | Source | Description |
|---------|--------|-------------|
| **Fee Claim Alerts** | telegram-bot, claim-bot | Real-time notifications when creators claim fees |
| **Token Launch Monitor** | telegram-bot, channel-bot | Detect new PumpFun token mints |
| **Graduation Alerts** | telegram-bot, channel-bot | Bonding curve completion → AMM migration |
| **Whale Trade Alerts** | telegram-bot, channel-bot | Large buy/sell above configurable threshold |
| **CTO Alerts** | telegram-bot | Creator Takeover (fee redirection) detection |
| **Fee Distributions** | telegram-bot, channel-bot | Fee sharing payouts to shareholders |
| **Channel Broadcast** | channel-bot | Read-only Telegram channel feed mode |
| **DM Commands** | telegram-bot, claim-bot | `/watch`, `/add`, `/remove`, `/list`, `/status` |
| **REST API + SSE** | telegram-bot | HTTP endpoints, Server-Sent Events streaming |
| **Webhooks** | telegram-bot | Outbound webhook dispatch for integrations |
| **Twitter/X Tracking** | claim-bot, channel-bot | Track tokens by X handle, follower counts |
| **GitHub Social Fees** | channel-bot | Social fee PDA lookup via GitHub |

### Tracker Bot (`@pumpkit/tracker`)

| Feature | Description |
|---------|-------------|
| **Call Tracking** | Paste a token CA → bot registers and tracks performance |
| **Leaderboards** | Top calls by multiplier, rankings by points (24h/7d/30d/all) |
| **PNL Cards** | Shareable Canvas-rendered images (entry, ATH, gain) |
| **Ranking System** | Amateur → Novice → Contender → Guru → Oracle |
| **Points System** | -1 to +5 based on call multiplier |
| **Win Rate** | Percentage of calls hitting ≥ 2x |
| **Hardcore Mode** | Auto-kick below minimum win rate |
| **Multi-Chain** | Solana, Ethereum, Base, BSC |

## Hosting

| Component | Platform | Cost |
|-----------|----------|------|
| Monitor Bot | Railway | ~$5/mo (Hobby) |
| Tracker Bot | Railway | ~$5/mo (Hobby) |
| Documentation | Vercel | Free |

## Tech Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript (ES modules, strict mode)
- **Telegram:** grammy v1.35+
- **Solana:** @solana/web3.js v1.98+
- **Database:** better-sqlite3 (tracker), file-based JSON (monitor)
- **Build:** tsup (library), tsc (bots)
- **Monorepo:** Turborepo
- **Deployment:** Docker + Railway

## Documentation

- [Architecture](docs/architecture.md) — System design, module boundaries, data flow
- [Getting Started](docs/getting-started.md) — Setup, configuration, first bot
- [Core API](docs/core-api.md) — `@pumpkit/core` module reference
- [Monitor Bot](docs/monitor-bot.md) — Feature spec, commands, configuration
- [Tracker Bot](docs/tracker-bot.md) — Feature spec, commands, configuration
- [Deployment](docs/deployment.md) — Railway, Docker, Vercel setup
- [Contributing](CONTRIBUTING.md) — How to contribute

## Origins

PumpKit was extracted from the [pump-fun-sdk](https://github.com/nirholas/pump-fun-sdk) Telegram bot ecosystem — 4 production bots with 50+ source files consolidated into a clean, reusable framework.

## License

MIT
