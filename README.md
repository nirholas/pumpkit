# PumpKit   

> Open-source framework for building PumpFun Telegram bots on Solana. Claim monitors, channel feeds, group trackers, whale alerts — build your own or use ours.
>
>  [PumpKit Web App + Documentation](https://pumpkits.vercel.app)

---

## Read this first (no jargon)

If you are not a developer and the rest of this README looks intimidating, here is the one-paragraph version:

> **PumpFun** is a website on the Solana blockchain where anyone can launch a coin in seconds. The coin starts cheap, gets more expensive the more people buy it (this is called a "bonding curve"), and if it gets popular enough it "graduates" to a regular trading pool. The creator earns small fees on every trade. **PumpKit** is a toolkit that lets you (or your team) run a **Telegram bot** that watches PumpFun in real time and posts when something interesting happens — a new coin launched, a coin graduated, a whale (large buyer) just bought, someone claimed their creator fees, etc. The bots are already built. You only need a Telegram bot token (free, takes 30 seconds from a Telegram account called BotFather) and a Solana RPC URL (free tier is fine for testing).

If you *are* a developer, the rest of this README is the manual: framework architecture, every module of `@pumpkit/core`, the full Pump protocol reference (bonding curve math, fee tiers, fee sharing, social fees, cashback, token incentives, mayhem mode, AMM trading, every on-chain event), deployment guides, performance benchmarks, RPC best practices, error reference, troubleshooting, migration notes, glossary, FAQ, security model, vision, and roadmap. It is intentionally long — everything from [`docs/`](docs/) is inlined here so you can `Ctrl+F` instead of opening 30 tabs.

---

## Table of Contents

- [What is PumpKit?](#what-is-pumpkit)
- [Why PumpKit?](#why-pumpkit)
- [Who is this for?](#who-is-this-for)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Getting Started (Detailed)](#getting-started-detailed)
- [Packages](#packages)
- [Live Bots](#live-bots)
- [Features](#features)
- [Hosting](#hosting)
- [Tech Stack](#tech-stack)
- [Documentation](#documentation)
- [Development Guide](#development-guide)
- [`@pumpkit/core` — Full API Reference](#pumpkitcore--full-api-reference)
- [Monitor Bot — Feature Specification](#monitor-bot--feature-specification)
- [Tracker Bot — Feature Specification](#tracker-bot--feature-specification)
- [Channel Bot — Architecture](#channel-bot--architecture)
- [SDK Integration](#sdk-integration)
- [Pump Protocol Reference](#pump-protocol-reference)
- [USDC Quote Pair (V2)](#usdc-quote-pair-v2)
- [RPC Best Practices](#rpc-best-practices)
- [Deployment](#deployment)
- [Performance & Benchmarks](#performance--benchmarks)
- [Security Model](#security-model)
- [CLI Guide — Vanity Addresses](#cli-guide--vanity-addresses)
- [Error Reference](#error-reference)
- [Troubleshooting](#troubleshooting)
- [Glossary](#glossary)
- [FAQ](#faq)
- [Migration Guide (SDK Versions)](#migration-guide-sdk-versions)
- [Ecosystem at a Glance](#ecosystem-at-a-glance)
- [PumpOS Web Desktop (optional)](#pumpos-web-desktop-optional)
- [DeFi Agents (optional)](#defi-agents-optional)
- [Vision](#vision)
- [Roadmap](#roadmap)
- [Origins](#origins)
- [License](#license)

---

## What is PumpKit?

PumpKit is a TypeScript framework and collection of production-ready bots for monitoring PumpFun activity on Solana via Telegram. It provides:

- **`@pumpkit/core`** — Shared framework: bot scaffolding, Solana monitoring, formatters, storage, config, health checks
- **`@pumpkit/monitor`** — All-in-one monitoring bot (fee claims, launches, graduations, whale trades, CTO alerts)
- **`@pumpkit/tracker`** — Group call-tracking bot (leaderboards, PNL cards, rankings, multi-chain)

> **Plain English:** PumpKit is the "WordPress of PumpFun Telegram bots." Instead of every developer rewriting the same Solana plumbing, the same grammy bot setup, and the same message formatting code, you get a shared core and several ready-to-deploy bots that you can run as-is or fork.

## Why PumpKit?

Claim bots and PumpFun monitors are some of the most popular Telegram bots in crypto. But every builder starts from scratch — writing the same grammy setup, Solana RPC connections, message formatters, and deployment configs.

PumpKit gives you production-tested building blocks so you can ship a bot in hours, not weeks.

## Who is this for?

| You are… | What you'll use PumpKit for |
|---|---|
| **A non-technical creator** running a community | Deploy the Monitor Bot to your Telegram channel to auto-post launches, graduations, and whale trades. |
| **A small dev shop or freelancer** | Fork the Monitor Bot, swap in your own branding, and resell it as a custom alert service. |
| **A token launch team** | Use the Channel Bot to broadcast every fee claim for accountability and transparency. |
| **A trading group / alpha chat** | Drop the Tracker Bot into your group to score "calls" by multiplier and run a leaderboard. |
| **A protocol engineer / quant** | Use `@pumpkit/core`'s monitors, decoders, and bridge to `@nirholas/pump-sdk` to build analytics, indexers, or trading bots. |
| **An AI/agent builder** | Reuse the typed event decoders + monitor lifecycle inside your own agent framework. |

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

Repo layout at a glance:

```
pumpkit/
├── packages/
│   ├── core/              @pumpkit/core — shared framework
│   ├── monitor/           @pumpkit/monitor — monitoring bot
│   ├── channel/           @pumpkit/channel — read-only channel feed
│   ├── claim/             @pumpkit/claim — fee claim tracker
│   ├── tracker/           @pumpkit/tracker — group tracker bot
│   └── web/               @pumpkit/web — dashboard (skeleton)
├── docs/                  documentation (everything in this README is also here)
├── tutorials/             numbered, hands-on guides (45+)
├── examples/              starter dashboards & templates
├── agent-prompts/         multi-step refactor prompts
├── prompts/               one-shot workflow prompts
├── security/              audits, checklists
├── tools/                 shell + ts utilities
├── tmp/                   ephemeral scratch
└── turbo.json             monorepo build pipeline
```

Package dependency graph — `@pumpkit/core` has zero internal dependencies, only external npm packages:

```
@pumpkit/monitor ──→ @pumpkit/core
@pumpkit/tracker ──→ @pumpkit/core
@pumpkit/channel ──→ @pumpkit/core
@pumpkit/claim   ──→ @pumpkit/core
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

---

## Getting Started (Detailed)

> Build your own PumpFun bot in minutes — start-to-finish walk-through.

### Prerequisites

- Node.js 20+
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))
- A Solana RPC URL (free tier: [Helius](https://helius.dev), [QuickNode](https://quicknode.com), or public `https://api.mainnet-beta.solana.com`)

### Option 1 — Run a Pre-Built Bot

**Monitor Bot** (fee claims, launches, whales, graduations):

```bash
git clone https://github.com/pumpkit/pumpkit.git
cd pumpkit
npm install
cp packages/monitor/.env.example packages/monitor/.env
```

Edit `packages/monitor/.env`:

```bash
TELEGRAM_BOT_TOKEN=your-bot-token-here
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your-key
```

Run:

```bash
npm run dev --workspace=@pumpkit/monitor
```

Your bot is live. Send `/start` to it on Telegram.

**Tracker Bot** (group call tracking, leaderboards):

```bash
cp packages/tracker/.env.example packages/tracker/.env
```

```bash
TELEGRAM_BOT_TOKEN=your-other-bot-token
```

```bash
npm run dev --workspace=@pumpkit/tracker
```

Add the bot to a Telegram group. Members can paste token CAs to start tracking calls.

### Option 2 — Build a Custom Bot

#### 1. Create a new project

```bash
mkdir my-pump-bot
cd my-pump-bot
npm init -y
npm install @pumpkit/core grammy dotenv
npm install -D typescript @types/node tsx
```

#### 2. Create `.env`

```bash
TELEGRAM_BOT_TOKEN=your-bot-token
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

#### 3. Write your bot — `src/index.ts`

```typescript
import 'dotenv/config';
import { createBot, ClaimMonitor, formatClaim, log } from '@pumpkit/core';

const bot = createBot({
  token: process.env.TELEGRAM_BOT_TOKEN!,
  commands: {
    start: (ctx) => ctx.reply(
      '👋 Welcome! I monitor PumpFun fee claims.\n' +
      'Send /watch <wallet> to track a wallet.'
    ),
    help: (ctx) => ctx.reply(
      '/watch <wallet> — Track fee claims\n' +
      '/unwatch <wallet> — Stop tracking\n' +
      '/list — Show watched wallets'
    ),
  },
});

const monitor = new ClaimMonitor({
  rpcUrl: process.env.SOLANA_RPC_URL!,
  onClaim: async (event) => {
    const message = formatClaim(event);
    for (const chatId of getWatchers(event.wallet)) {
      await bot.api.sendMessage(chatId, message, { parse_mode: 'HTML' });
    }
  },
});

const watchers = new Map<string, Set<number>>();
function getWatchers(wallet: string): number[] {
  return [...(watchers.get(wallet) || [])];
}

bot.command('watch', (ctx) => {
  const wallet = ctx.match?.trim();
  if (!wallet) return ctx.reply('Usage: /watch <wallet_address>');
  if (!watchers.has(wallet)) watchers.set(wallet, new Set());
  watchers.get(wallet)!.add(ctx.chat.id);
  ctx.reply(`✅ Watching ${wallet} for fee claims.`);
});

bot.command('unwatch', (ctx) => {
  const wallet = ctx.match?.trim();
  if (!wallet) return ctx.reply('Usage: /unwatch <wallet_address>');
  watchers.get(wallet)?.delete(ctx.chat.id);
  ctx.reply(`🚫 Stopped watching ${wallet}.`);
});

bot.command('list', (ctx) => {
  const watching = [...watchers.entries()]
    .filter(([, ids]) => ids.has(ctx.chat.id))
    .map(([w]) => `• <code>${w}</code>`);
  ctx.reply(watching.length ? watching.join('\n') : 'No wallets being watched.', { parse_mode: 'HTML' });
});

monitor.start();
bot.launch();
log.info('Bot running!');

const shutdown = () => { monitor.stop(); bot.stop(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

#### 4. Run it

```bash
npx tsx src/index.ts
```

#### 5. Iterate — add more monitors

```typescript
import { LaunchMonitor, WhaleMonitor, formatLaunch, formatWhaleTrade } from '@pumpkit/core';

const launchMonitor = new LaunchMonitor({
  rpcUrl: process.env.SOLANA_RPC_URL!,
  onLaunch: async (event) => {
    await bot.api.sendMessage(CHANNEL_ID, formatLaunch(event), { parse_mode: 'HTML' });
  },
});

const whaleMonitor = new WhaleMonitor({
  rpcUrl: process.env.SOLANA_RPC_URL!,
  thresholdSol: 50,
  onWhaleTrade: async (event) => {
    await bot.api.sendMessage(CHANNEL_ID, formatWhaleTrade(event), { parse_mode: 'HTML' });
  },
});
```

Persistence:

```typescript
import { FileStore } from '@pumpkit/core';

interface Watch { wallet: string; chatId: number; }
const store = new FileStore<Watch[]>({ path: 'data/watches.json', defaultValue: [] });

for (const { wallet, chatId } of store.read()) {
  if (!watchers.has(wallet)) watchers.set(wallet, new Set());
  watchers.get(wallet)!.add(chatId);
}
```

Health check:

```typescript
import { createHealthServer } from '@pumpkit/core';

createHealthServer({
  port: 3000,
  getStats: () => ({
    watchers: watchers.size,
    monitoring: monitor.status(),
  }),
});
```

---

## Packages

| Package | Description | Status |
|---------|-------------|--------|
| [`@pumpkit/core`](packages/core/) | Shared framework — logger, health server, config, shutdown, types | ✅ Ready |
| [`@pumpkit/monitor`](packages/monitor/) | All-in-one PumpFun monitor bot (DM + channel + API) | ✅ Ready |
| [`@pumpkit/channel`](packages/channel/) | Read-only Telegram channel feed (broadcasts token events) | ✅ Ready |
| [`@pumpkit/claim`](packages/claim/) | Fee claim tracker by token CA or X handle | ✅ Ready |
| [`@pumpkit/tracker`](packages/tracker/) | Group call-tracking bot with leaderboards & PNL cards | ✅ Ready |
| [`@pumpkit/web`](packages/web/) | Frontend dashboard and documentation site | 🏗️ Skeleton |

> **npm:** Packages will be published to npm under the `@pumpkit` scope. See [npm Packages](docs/npm.md) for the publishing roadmap.

## Live Bots

Production bots running on Telegram, powered by PumpKit:

| Bot | Link | Description |
|-----|------|-------------|
| **PumpFun Claims** | [@pumpfunclaims](https://t.me/pumpfunclaims) | Channel feed — broadcasts first fee claims by GitHub-assigned developers |
| **Migrated PumpFun** | [@migratedpumpfun](https://t.me/migratedpumpfun) | Channel feed — tracks token graduations from bonding curve to PumpSwap AMM |
| **Cryptocurrency Vision** | [@cryptocurrencyvisionbot](https://t.me/cryptocurrencyvisionbot) | Interactive bot — PumpFun token analytics, whale alerts, and market insights |

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

### Channel Bot (`@pumpkit/channel`)

| Feed | Env Variable | Default |
|------|-------------|---------|
| Fee claims | `FEED_CLAIMS` | `true` |
| Token launches | `FEED_LAUNCHES` | `true` |
| Graduations | `FEED_GRADUATIONS` | `true` |
| Whale trades | `FEED_WHALES` | `true` |
| Fee distributions | `FEED_FEE_DISTRIBUTIONS` | `true` |

The channel bot is a one-way feed — no commands, no interactive UI. It monitors Solana, builds compact HTML messages, and pushes them to a channel. See [Channel Bot — Architecture](#channel-bot--architecture) for the data flow.

### Claim Bot (`@pumpkit/claim`)

Specialized fee-claim tracker. Subscribe by token contract address or by X/Twitter handle (e.g., `/add @creator` resolves the creator's recently launched tokens). Pairs well with the Monitor Bot when you only want claim notifications, no other noise.

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

### Getting Started
- [Getting Started](docs/getting-started.md) — Setup, configuration, first bot
- [Development](docs/development.md) — Local environment, commands, debugging
- [Architecture](docs/architecture.md) — System design, module boundaries, data flow
- [Deployment](docs/deployment.md) — Railway, Docker, Vercel setup
- [FAQ](docs/faq.md) — Common questions and troubleshooting

### Package Docs
- [Core API](docs/core-api.md) — `@pumpkit/core` module reference
- [Monitor Bot](docs/monitor-bot.md) — Feature spec, commands, configuration
- [Tracker Bot](docs/tracker-bot.md) — Feature spec, commands, configuration
- [npm Packages](docs/npm.md) — Package installation and usage

### Pump Protocol Reference
- [Protocol Overview](docs/pump-protocol/) — All 9 official protocol specs + IDLs
- [Bonding Curve Math](docs/guides/bonding-curve-math.md) — Constant-product formula, buy/sell calculations
- [Fee Tiers](docs/guides/fee-tiers.md) — Market-cap-based dynamic fee selection
- [Fee Sharing](docs/guides/fee-sharing.md) — Multi-shareholder fee distribution
- [Social Fees](docs/guides/social-fees.md) — GitHub identity-based fee sharing
- [Cashback](docs/guides/cashback.md) — Trader cashback opt-in system
- [Token Incentives](docs/guides/token-incentives.md) — Volume-based PUMP rewards
- [Mayhem Mode](docs/guides/mayhem-mode.md) — Alternate vault routing, Token2022
- [Events Reference](docs/guides/events-reference.md) — 20+ on-chain event types
- [Analytics](docs/guides/analytics.md) — Price impact, graduation progress, market cap
- [End-to-End Workflow](docs/guides/end-to-end-workflow.md) — Full token lifecycle

### Reference
- [Glossary](docs/glossary.md) — Key terms and definitions
- [Code Examples](docs/examples.md) — Practical code samples
- [Error Reference](docs/errors.md) — Custom error classes and fixes
- [RPC Best Practices](docs/rpc-best-practices.md) — Provider selection, batching, rate limiting
- [Performance](docs/performance.md) — Benchmarks, latency, and optimization tips
- [Security Guide](docs/guides/security.md) — Crypto library rules, key management
- [Wallet & Keypair Safety](docs/guides/wallet-safety.md) — Keypair handling, gitignore patterns, leak recovery
- [Troubleshooting](docs/troubleshooting.md) — Common issues and solutions
- [Support](docs/support.md) — Getting help, bug reports, feature requests
- [Roadmap](docs/roadmap.md) — Where PumpKit is headed

### Tutorials

26 hands-on guides in [tutorials/](tutorials/):

| Tutorial | Topic |
|----------|-------|
| [Create Token](tutorials/01-create-token.md) | Launch a token on bonding curve |
| [Buy Tokens](tutorials/02-buy-tokens.md) | Purchase tokens via bonding curve |
| [Sell Tokens](tutorials/03-sell-tokens.md) | Sell tokens back for SOL |
| [Create & Buy](tutorials/04-create-and-buy.md) | Atomic create + first buy |
| [Bonding Curve Math](tutorials/05-bonding-curve-math.md) | Price calculation formulas |
| [Migration](tutorials/06-migration.md) | Token graduation to AMM |
| [Fee Sharing](tutorials/07-fee-sharing.md) | Shareholder setup |
| [Token Incentives](tutorials/08-token-incentives.md) | Volume-based rewards |
| [Fee System](tutorials/09-fee-system.md) | Tiered fee calculations |
| [Working with PDAs](tutorials/10-working-with-pdas.md) | Program Derived Addresses |
| [Trading Bot](tutorials/11-trading-bot.md) | Condition-based trading patterns |
| [Decoding Accounts](tutorials/15-decoding-accounts.md) | Parse on-chain account data |
| [Monitoring Claims](tutorials/16-monitoring-claims.md) | Fee claim monitoring architecture |
| [Telegram Bot](tutorials/18-telegram-bot.md) | Interactive DM bot with grammy |
| [MCP Server](tutorials/20-mcp-server-ai-agents.md) | AI agent integration |
| [WebSocket Feeds](tutorials/21-websocket-realtime-feeds.md) | Real-time token data |
| [Channel Bot Setup](tutorials/22-channel-bot-setup.md) | Read-only broadcast feed |
| [Event Parsing](tutorials/29-event-parsing-analytics.md) | Decoding on-chain events |
| [Error Handling](tutorials/33-error-handling-patterns.md) | Validation and error classes |
| [Security Auditing](tutorials/37-security-auditing-verification.md) | Security audit checklist |
| [AI Enrichment](tutorials/39-channel-bot-ai-enrichment.md) | GitHub + AI-powered cards |
| [Your First Claim Bot](tutorials/40-your-first-claim-bot.md) | Build a claim bot from scratch |
| [Customizing Claim Cards](tutorials/41-customizing-claim-cards.md) | HTML formatting, badges, enrichment |
| [Channel Feed Bot](tutorials/42-channel-feed-bot.md) | Channel broadcasting setup |
| [Understanding Events](tutorials/43-understanding-pumpfun-events.md) | On-chain event types and parsing |

### Community
- [Contributing](CONTRIBUTING.md) — How to contribute
- [Code of Conduct](CODE_OF_CONDUCT.md) — Community standards
- [Security Policy](SECURITY.md) — Vulnerability reporting
- [Changelog](CHANGELOG.md) — Release history

---

## Development Guide

### Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Node.js | ≥ 20.0 | Runtime |
| npm | ≥ 9.0 | Package manager (workspaces) |
| TypeScript | 5.7+ | Language (installed via devDeps) |
| Git | Any | Version control |

Optional per-package:

| Requirement | Package | Purpose |
|-------------|---------|---------|
| Canvas deps | `@pumpkit/tracker` | PNL card generation (libcairo, libpango) |
| SQLite | `@pumpkit/tracker` | Database (better-sqlite3, native addon) |

### Setup

```bash
git clone https://github.com/nirholas/pumpkit.git
cd pumpkit
npm install
```

### Development Commands

```bash
# Run a specific bot in watch mode
npm run dev --workspace=@pumpkit/monitor
npm run dev --workspace=@pumpkit/tracker

# Build all packages
npm run build

# Type-check all packages
npm run typecheck

# Lint all packages
npm run lint

# Clean all build outputs
npm run clean
```

There's also a [`Makefile`](Makefile) with shortcuts (`make dev-monitor`, `make docker-tracker`, `make help`).

### Turborepo Pipeline

PumpKit uses [Turborepo](https://turbo.build/) for monorepo orchestration. The pipeline is defined in `turbo.json`:

- `build` — Compiles TypeScript (`tsc`) for each package
- `dev` — Runs in watch mode (`tsx watch`)
- `typecheck` — Type checks without emitting (`tsc --noEmit`)
- `lint` — Runs ESLint
- `clean` — Removes `dist/` and `node_modules/`

Tasks respect dependency order — `@pumpkit/monitor` waits for `@pumpkit/core` to build first.

### TypeScript Configuration

All packages extend `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

Each package overrides `outDir`, `rootDir`, and adds specific `include`/`exclude` patterns.

### Environment Variables

```bash
cp packages/monitor/.env.example packages/monitor/.env
cp packages/tracker/.env.example packages/tracker/.env
```

**Common Variables:**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | — | From [@BotFather](https://t.me/BotFather) |
| `SOLANA_RPC_URL` | No | `https://api.mainnet-beta.solana.com` | Solana RPC endpoint |
| `SOLANA_WS_URL` | No | Derived from RPC URL | WebSocket endpoint |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |

**Monitor-Specific:**

| Variable | Default | Description |
|----------|---------|-------------|
| `POLL_INTERVAL_SECONDS` | `60` | How often to poll for claims |
| `ENABLE_LAUNCH_MONITOR` | `false` | Monitor new token launches |
| `ENABLE_GRADUATION_ALERTS` | `true` | Alert on bonding curve graduations |
| `ENABLE_TRADE_ALERTS` | `false` | Alert on trades |
| `WHALE_THRESHOLD_SOL` | `10` | Minimum SOL to trigger whale alert |
| `ALLOWED_USER_IDS` | — | Comma-separated Telegram user IDs |

**Tracker-Specific:**

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PATH` | `data/tracker.db` | SQLite database path |
| `ATH_POLL_INTERVAL` | `30000` | ATH check interval (ms) |
| `DEXSCREENER_API` | `https://api.dexscreener.com` | Price data source |

### Canvas Dependencies (Tracker)

The tracker bot uses `canvas` for PNL card generation.

```bash
# Ubuntu/Debian
sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

# Alpine (Docker)
apk add --no-cache build-base cairo-dev pango-dev jpeg-dev giflib-dev librsvg-dev

# macOS
brew install pkg-config cairo pango libpng jpeg giflib librsvg
```

### Debugging

**Bot not responding:**
1. Check `TELEGRAM_BOT_TOKEN` is valid: `curl https://api.telegram.org/bot<TOKEN>/getMe`
2. Make sure no other instance is polling (Telegram only allows one)
3. Check logs for connection errors

**RPC errors:**
1. Verify reachability: `curl <RPC_URL> -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'`
2. Public endpoints are rate-limited — use a paid provider for production
3. Set `SOLANA_RPC_URLS` (comma-separated) for fallbacks

**SQLite issues (tracker):**
1. Rebuild native addon: `npm rebuild better-sqlite3`
2. Ensure `DB_PATH` directory exists and is writable
3. If the schema changed, delete the DB to let it recreate

### Code Style

- **TypeScript strict mode** — no implicit `any`, no unchecked index access
- **ES modules** — `import`/`export`, `.js` extension in relative imports
- **grammy** for Telegram — not Telegraf or node-telegram-bot-api
- **HTML** for Telegram messages — not Markdown
- **Leveled logging** — use `log.info/warn/error/debug`, never `console.log`
- **Graceful shutdown** — every entry point handles `SIGINT`/`SIGTERM`
- **BN.js** for financial amounts — never JavaScript `number`

### Adding a New Package

1. Create `packages/my-bot/`
2. Add `package.json` with `"name": "@pumpkit/my-bot"`
3. Add `tsconfig.json` extending `../../tsconfig.base.json`
4. Add `src/index.ts` entry point
5. Add `.env.example` with required variables
6. Add `Dockerfile` for deployment
7. Update root `turbo.json` if a custom pipeline is needed

---

## `@pumpkit/core` — Full API Reference

> Shared framework modules for building PumpFun Telegram bots.

```bash
npm install @pumpkit/core
```

### `bot/` — Telegram Scaffolding

#### `createBot(options): Bot`

Factory function that creates a configured grammy `Bot` with error handling, graceful shutdown, and standard middleware.

```typescript
import { createBot } from '@pumpkit/core';

const bot = createBot({
  token: process.env.TELEGRAM_BOT_TOKEN!,
  commands: {
    start: (ctx) => ctx.reply('Welcome!'),
    help: (ctx) => ctx.reply('Available commands: /start, /help'),
  },
  onError: (err) => console.error('Bot error:', err),
  parseMode: 'HTML',
  adminChatIds: [123456789],
});

await bot.launch();
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `token` | `string` | ✅ | — | Telegram bot token from BotFather |
| `commands` | `Record<string, CommandHandler>` | ❌ | `{}` | Command handlers |
| `onError` | `(err: Error) => void` | ❌ | `console.error` | Global error handler |
| `parseMode` | `'HTML' \| 'MarkdownV2'` | ❌ | `'HTML'` | Default parse mode |
| `adminChatIds` | `number[]` | ❌ | `[]` | Chat IDs for error notifications |

```typescript
await bot.broadcast([chatId1, chatId2], formatClaim(event)); // Auto rate-limit (30 msg/sec)
bot.notifyAdmins('Bot restarted');
```

### `monitor/` — Event Monitors

All monitors share the same lifecycle:

```typescript
monitor.start();   // Begin monitoring
monitor.stop();    // Graceful stop
monitor.status();  // { running, lastEvent, eventsProcessed }
```

#### `ClaimMonitor`

```typescript
const monitor = new ClaimMonitor({
  rpcUrl: process.env.SOLANA_RPC_URL!,
  rpcFallbackUrls: ['https://backup-rpc.example.com'],
  pollIntervalMs: 5000,
  onClaim: async (event) => { /* ... */ },
});

interface ClaimEvent {
  signature: string;
  wallet: PublicKey;
  mint: PublicKey;
  amount: BN;
  tokenName?: string;
  tokenSymbol?: string;
  timestamp: number;
}
```

#### `LaunchMonitor`

```typescript
const monitor = new LaunchMonitor({
  rpcUrl: process.env.SOLANA_RPC_URL!,
  onLaunch: async (event) => { /* ... */ },
});

interface LaunchEvent {
  signature: string;
  mint: PublicKey;
  creator: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  isMayhemMode: boolean;
  hasCashback: boolean;
  timestamp: number;
}
```

#### `GraduationMonitor`, `WhaleMonitor`, `CTOMonitor`, `FeeDistMonitor`

Same shape — pass an `rpcUrl` and an `on...` callback. `WhaleMonitor` adds a `thresholdSol` parameter.

### `solana/` — Utilities

```typescript
import {
  createRpcConnection,
  PUMP_PROGRAM_ID,
  PUMP_AMM_PROGRAM_ID,
  PUMP_FEE_PROGRAM_ID,
  decodePumpLogs,
} from '@pumpkit/core';

const connection = createRpcConnection({
  url: process.env.SOLANA_RPC_URL!,
  fallbackUrls: ['https://backup1.example.com'],
  commitment: 'confirmed',
});

connection.onLogs(PUMP_PROGRAM_ID, (logInfo) => {
  const events = decodePumpLogs(logInfo.logs);
  for (const event of events) {
    switch (event.type) {
      case 'create': /* ... */
      case 'buy': /* ... */
      case 'sell': /* ... */
      case 'complete': /* graduation */
    }
  }
});
```

### `formatter/` — Message Formatting

```typescript
import { formatClaim, formatLaunch, formatGraduation, formatWhaleTrade, formatCTO, formatFeeDistribution,
         link, solscanTx, solscanAccount, pumpFunToken } from '@pumpkit/core';

formatClaim(claimEvent);             // returns HTML string
formatLaunch(launchEvent);
formatGraduation(gradEvent);
formatWhaleTrade(whaleEvent);
formatCTO(ctoEvent);
formatFeeDistribution(distEvent);

link('View TX', 'https://...');
solscanTx(signature);
solscanAccount(address);
pumpFunToken(mint);
```

All formatters return HTML compatible with Telegram's `parse_mode: 'HTML'`.

### `storage/` — Persistence

```typescript
import { FileStore, SqliteStore } from '@pumpkit/core';

const store = new FileStore<Watch[]>({ path: 'data/watches.json', defaultValue: [] });
const watches = store.read();
store.write([...watches, newWatch]);

const db = new SqliteStore('data/bot.sqlite');
db.exec(`CREATE TABLE IF NOT EXISTS calls (...)`);
const calls = db.query('SELECT * FROM calls WHERE group_id = ?', [groupId]);
db.close();
```

### `config/` — Configuration Loader

```typescript
import { loadConfig } from '@pumpkit/core';

const config = loadConfig({
  TELEGRAM_BOT_TOKEN: { type: 'string', required: true },
  SOLANA_RPC_URL: { type: 'string', required: true },
  FEED_CLAIMS: { type: 'boolean', default: true },
  WHALE_THRESHOLD_SOL: { type: 'number', default: 100 },
  API_PORT: { type: 'number', default: 3000 },
  ADMIN_CHAT_IDS: { type: 'string[]', default: [], separator: ',' },
});
```

### `health/` — Health Checks

```typescript
createHealthServer({
  port: 3000,
  getStats: () => ({ monitors: monitor.status(), watches: store.read().length }),
});
// GET /health → { status: 'ok', uptime: '3600s', monitors: {...} }
```

### `logger/` — Logging

```typescript
import { log } from '@pumpkit/core';
log.debug(...); log.info(...); log.warn(...); log.error(...);
// LOG_LEVEL env var: debug | info | warn | error
```

### `api/` — REST + SSE + Webhooks

```typescript
const api = createApiServer({
  port: 3000,
  authToken: process.env.API_AUTH_TOKEN,
  routes: (app) => {
    app.get('/claims', (req, res) => res.json(recentClaims));
    app.get('/status', (req, res) => res.json(monitor.status()));
  },
  sse: { path: '/stream', events: eventBus },
  webhooks: { path: '/webhooks', store: webhookStore },
});
```

### `social/` — Integrations

```typescript
const twitter = new TwitterClient({ bearerToken: process.env.TWITTER_BEARER_TOKEN! });
const { followers, followsInfluencers } = await twitter.getUserInfo('@handle');

const github = new GitHubClient({ token: process.env.GITHUB_TOKEN });
const socialFeePda = await github.lookupSocialFee(mint);
```

### Types

```typescript
import type {
  ClaimEvent, LaunchEvent, GraduationEvent, WhaleTradeEvent, CTOEvent, FeeDistEvent, PumpEvent,
  MonitorOptions, MonitorStatus, BaseMonitorConfig,
  BotConfig, MonitorConfig, TrackerConfig, ConfigSchema,
} from '@pumpkit/core';
```

---

## Monitor Bot — Feature Specification

The Monitor Bot consolidates 3 production bots into one (`telegram-bot` + `channel-bot` + `claim-bot` → ~20 files in `@pumpkit/monitor`).

### Interaction Modes

**Mode 1 — Interactive DM:**

```
User: /watch 7xKXt...
Bot: ✅ Watching wallet 7xKXt... for fee claims.

Bot: 🔔 Fee Claimed!
     Wallet: 7xKXt...
     Amount: 2.5 SOL
     Token: $PUMP (PumpCoin)
```

**Mode 2 — Channel Broadcast:**

```
Channel: PumpFun Activity
Bot: 🚀 New Token Launch
     Name: PumpCoin ($PUMP)
     Mayhem Mode: ❌  Cashback: ✅

Bot: 🎓 Token Graduated!
     $MOON migrated to PumpAMM
     Final mcap: 69,000 SOL

Bot: 🐋 Whale Buy
     500 SOL → $DEGEN  Progress: ████████░░ 82%
```

**Mode 3 — Group Chat:**

```
Group Member: /watch 7xKXt...
Bot: ✅ This group will be notified about 7xKXt... fee claims.
```

### User Commands

| Command | Description | Modes |
|---------|-------------|-------|
| `/start` | Welcome message + quick start | DM, Group |
| `/help` | Full command reference | DM, Group |
| `/watch <wallet>` | Track a wallet for fee claims | DM, Group |
| `/unwatch <wallet>` | Stop tracking a wallet | DM, Group |
| `/add <CA or @handle>` | Track a token or X account | DM, Group |
| `/remove <CA or @handle>` | Stop tracking | DM, Group |
| `/list` | Show all tracked items | DM, Group |
| `/status` | Monitor status + stats | DM, Group |
| `/price <CA>` | Current token price | DM, Group |
| `/quote <CA> <amount>` | Buy/sell quote | DM, Group |
| `/fees <CA>` | Fee info for a token | DM, Group |
| `/alerts [on/off]` | Toggle alert types | DM, Group |

### Admin Commands

| Command | Description |
|---------|-------------|
| `/monitor [start/stop]` | Start/stop event monitoring |
| `/broadcast <message>` | Send message to all watchers |

### Alert Feeds

| Feed | Env Var | Default |
|------|---------|---------|
| Fee Claims | `FEED_CLAIMS` | `true` |
| Token Launches | `FEED_LAUNCHES` | `true` |
| Graduations | `FEED_GRADUATIONS` | `true` |
| Whale Trades | `FEED_WHALES` | `true` |
| CTO Alerts | `FEED_CTO` | `true` |
| Fee Distributions | `FEED_FEE_DISTRIBUTIONS` | `true` |

### REST API (optional)

Enabled via `API_ENABLED=true`. All endpoints require `Authorization: Bearer <token>`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check + uptime |
| `GET` | `/status` | Monitor status + event counts |
| `GET` | `/watches` | List all active watches |
| `POST` | `/watches` | Add a watch `{ wallet, chatId }` |
| `DELETE` | `/watches/:wallet` | Remove a watch |
| `GET` | `/claims` | Recent claim events |
| `GET` | `/launches` | Recent launches |
| `GET` | `/stream` | SSE event stream |
| `POST` | `/webhooks` | Register webhook URL |
| `DELETE` | `/webhooks/:id` | Remove webhook |

### Social Integrations

- **Twitter/X** — Track tokens by handle, show follower counts, flag influencer follows
- **GitHub** — Look up social fee PDAs, enrich claim cards with repo info
- **Groq LLM** — Optional AI-generated token summaries (`GROQ_API_KEY`)

### File Structure

```
packages/monitor/
├── package.json
├── tsconfig.json
├── Dockerfile
├── railway.json
├── .env.example
└── src/
    ├── index.ts
    ├── bot.ts
    ├── config.ts
    ├── types.ts
    ├── monitors/
    │   ├── index.ts
    │   ├── claims.ts
    │   ├── launches.ts
    │   ├── graduations.ts
    │   ├── whales.ts
    │   ├── cto.ts
    │   └── distributions.ts
    ├── integrations/
    │   ├── twitter.ts
    │   ├── github.ts
    │   └── groq.ts
    └── api/
        ├── server.ts
        ├── sse.ts
        └── webhooks.ts
```

---

## Tracker Bot — Feature Specification

The Tracker Bot is adapted from **outsiders-bot** (11 files). It operates in Telegram groups where members paste token CAs, and the bot tracks performance, builds leaderboards, and generates PNL cards.

### Interaction Model

```
Group Chat: "Alpha Calls"
│
├── @alice pastes: EKpQGS...
│   Bot: 📞 Call registered by @alice
│        Token: $PUMP · Chain: Solana
│        Entry: $0.00012 | MC: $120K
│
├── (ATH tracker polls every 60s)
│
├── @bob: /leaderboard
│   Bot: 🏆 Top Calls (7d)
│        1. @alice — 15.2x $PUMP ⭐⭐⭐⭐⭐
│        2. @charlie — 8.7x $MOON ⭐⭐⭐⭐
│
├── @alice: /pnl
│   Bot: [Canvas-rendered PNL card image]
```

### Call Modes

- **Auto Mode** — Call registered automatically after 30-second confirmation window
- **Button Mode** — Manual confirm with alpha/gamble selection buttons

### Points System

| Multiplier | Points | Rating |
|-----------|--------|--------|
| < 1.5x | -1 | ❌ Miss |
| 1.5x - 2x | 0 | ➖ Break-even |
| 2x - 5x | +2 | ✅ Good |
| 5x - 15x | +3 | ⭐ Great |
| 15x - 30x | +4 | 🌟 Excellent |
| 30x+ | +5 | 💎 Legendary |

### Ranking System

| Rank | Title | Win Rate Required |
|------|-------|-------------------|
| 1 | Amateur | 0% |
| 2 | Novice | 20% |
| 3 | Contender | 35% |
| 4 | Guru | 50% |
| 5 | Oracle | 70% |

### Group Commands

| Command | Description |
|---------|-------------|
| `/leaderboard [calls\|performance] [24h\|7d\|30d\|all]` | Show leaderboard |
| `/last` | Show last call in group |
| `/calls [@user]` | Call history for user |
| `/pnl [@user]` | PNL card image |
| `/rank [@user]` | User rank + stats |
| `/alpha` | Register current CA as alpha call |
| `/gamble` | Register current CA as gamble call |

### Admin Commands

| Command | Description |
|---------|-------------|
| `/settings` | View/modify group settings |
| `/settings hardcore [on\|off] [min_winrate]` | Toggle hardcore mode |
| `/settings channel [channel_id]` | Set call forwarding channel |
| `/settings mode [auto\|button]` | Set call registration mode |
| `/block @user` | Block user from calls |
| `/unblock @user` | Unblock user |

### Multi-Chain Support

| Chain | Token Resolution | Price Source |
|-------|-----------------|--------------|
| Solana | Native CA (base58) | DexScreener |
| Ethereum | 0x address | DexScreener |
| Base | 0x address | DexScreener |
| BSC | 0x address | DexScreener |

### Database Schema

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  telegram_id TEXT UNIQUE NOT NULL,
  username TEXT,
  total_points INTEGER DEFAULT 0,
  total_calls INTEGER DEFAULT 0,
  winning_calls INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE groups (
  id INTEGER PRIMARY KEY,
  telegram_id TEXT UNIQUE NOT NULL,
  name TEXT,
  mode TEXT DEFAULT 'auto',
  hardcore_mode INTEGER DEFAULT 0,
  min_win_rate INTEGER DEFAULT 40,
  call_channel_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE calls (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  group_id INTEGER NOT NULL REFERENCES groups(id),
  token_ca TEXT NOT NULL,
  chain TEXT NOT NULL,
  call_type TEXT DEFAULT 'alpha',
  entry_price REAL NOT NULL,
  entry_mcap REAL,
  ath_price REAL,
  ath_mcap REAL,
  multiplier REAL DEFAULT 1.0,
  points INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE blocked_users (
  group_id INTEGER NOT NULL REFERENCES groups(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  blocked_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);
```

---

## Channel Bot — Architecture

The channel bot is a **one-way feed** — it monitors Solana for PumpFun events and posts formatted messages to a Telegram channel. No interactive commands. Channel: [@pumpfunclaims](https://t.me/pumpfunclaims).

### Data flow

```
Solana RPC (WebSocket)  ──► Event Monitor ──► Claim Tracker ──► Formatter ──► Telegram API
                                │                                     │
                                ▼                                     ▼
                          PumpFun API ◄────────────────────── Token + Creator Data
```

### Step-by-step

1. **Event Monitor** subscribes to Solana program logs via WebSocket (HTTP polling fallback)
2. On a fee-claim transaction, extract the event
3. **Claim Tracker** checks if this is the **first ever claim** on the token — drops it otherwise
4. **Pump Client** enriches in parallel (token info, creator profile, holders, trades, SOL/USD, GitHub URLs, bonding curve progress)
5. **Formatter** builds a compact emoji-dense HTML caption
6. With an image, send via `sendPhoto`; otherwise fall back to `sendMessage`

### Claim Tracker model

```typescript
interface ClaimRecord {
  claimCount: number;
  totalClaimedSol: number;
  firstClaimTimestamp: number;
  lastClaimTimestamp: number;
}
```

Capacity: 50,000 entries with LRU eviction.

### Dual-mode detection

| Mode | Method | Latency | Reliability |
|------|--------|---------|-------------|
| WebSocket | `connection.onLogs(PUMP_PROGRAM_ID)` | < 2s | May disconnect |
| HTTP Polling | `getSignaturesForAddress` + `getTransaction` | 5–10s | Reliable fallback |

### Example message

```
🆕 FIRST FEE CLAIM

🪙 TokenName $SYMBOL
💰 0.00021 SOL ⋅ $0.032
💎 Mcap: 21.6K ⋅ Curve: 45%
📊 Vol: 18K ⋅ 👥 285 ⋅ Age: 2d
🐙 github.com/dev/project

📅 Launched: 2h ago
👤 Creator: BYsXqJ…Vwmu (self-claim)
   50 launches ⋅ 🎓 3 graduated ⋅ 49 followers

💰 0.0154 SOL ($2.31) claimed
⏱ 2h after launch

🔗 TX ⋅ Wallet ⋅ Pump ⋅ DEX
🕐 2026-03-06 03:42:13 UTC
```

### Channel-bot env vars

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ | — | Bot token from BotFather |
| `TELEGRAM_CHANNEL_ID` | ✅ | — | Channel to post to |
| `SOLANA_RPC_URL` | ✅ | — | RPC endpoint |
| `SOLANA_WS_URL` | ❌ | Derived | WebSocket endpoint |
| `FEED_CLAIMS` | ❌ | `true` | Enable fee claim feed |
| `FEED_LAUNCHES` | ❌ | `true` | Enable token launch feed |
| `FEED_GRADUATIONS` | ❌ | `true` | Enable graduation feed |
| `FEED_WHALES` | ❌ | `true` | Enable whale trade feed |
| `FEED_FEE_DISTRIBUTIONS` | ❌ | `true` | Enable distribution feed |

---

## SDK Integration

PumpKit wraps the [pump-fun-sdk](https://github.com/nirholas/pump-fun-sdk) (`@nirholas/pump-sdk`) to provide bot-friendly async functions for querying bonding curves, token prices, graduation progress, and buy/sell quotes.

```typescript
import {
  getTokenPrice,
  getGraduationProgress,
  getBuyQuote,
  getSellQuote,
  getBondingCurveState,
} from '@pumpkit/core';

const price = await getTokenPrice(connection, mint);
const progress = await getGraduationProgress(connection, mint);
const buyQuote = await getBuyQuote(connection, mint, new BN(1_000_000_000));
const sellQuote = await getSellQuote(connection, mint, new BN(1_000_000));
const state = await getBondingCurveState(connection, mint);
```

All bridge functions return `null` when the bonding curve account doesn't exist. Network errors are caught internally and also return `null`.

### When to use the bridge vs the SDK directly

| Scenario | Use |
|----------|-----|
| Quick price check in a bot command | Bridge (`getTokenPrice`) |
| Building transaction instructions | SDK directly (`PUMP_SDK.buyInstructions()`) |
| Batch queries for many tokens | SDK directly (manual `getMultipleAccountsInfo`) |
| One-off graduation check | Bridge (`getGraduationProgress`) |
| Complex trading logic | SDK directly |

---

## Pump Protocol Reference

### On-chain Programs

| Program | ID | Events |
|---------|-----|--------|
| **Pump** | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` | Create, Buy, Sell, Complete (graduation) |
| **PumpAMM** | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` | Swap, CreatePool, Deposit, Withdraw |
| **PumpFees** | `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ` | ClaimFees, DistributeFees |
| **Mayhem** | `MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e` | Alternate vault/fee routing |

### Bonding Curve Math

The Pump bonding curve uses a **constant-product AMM formula** (similar to Uniswap).

**Virtual vs Real Reserves:**

| Reserve | Purpose |
|---------|---------|
| `virtualTokenReserves` | Token side of the constant-product — includes virtual liquidity |
| `virtualSolReserves` | SOL side of the constant-product — includes virtual liquidity |
| `realTokenReserves` | Tokens actually available for purchase |
| `realSolReserves` | SOL actually deposited |

**Constant invariant:**

```
k = virtualTokenReserves × virtualSolReserves
```

**Buy math:**

1. Deduct fees from input SOL:
   ```
   inputAmount = ((solAmount − 1) × 10000) / ((protocolFeeBps + creatorFeeBps) + 10000)
   ```
2. Apply constant-product:
   ```
   tokensOut = (inputAmount × virtualTokenReserves) / (virtualSolReserves + inputAmount)
   ```
3. Cap at `realTokenReserves`.

```typescript
const tokensOut = getBuyTokenAmountFromSolAmount({
  global, feeConfig,
  mintSupply: bondingCurve.tokenTotalSupply,
  bondingCurve,
  amount: solAmount,
});
```

**Sell math:**

```
solOut_raw = (tokenAmount × virtualSolReserves) / (virtualTokenReserves + tokenAmount)
solOut = solOut_raw − fees(solOut_raw)
```

**Market cap:**

```
marketCap = (virtualSolReserves × mintSupply) / virtualTokenReserves
```

**Graduation:** curve completes when `realTokenReserves` reaches zero and `bondingCurve.complete = true`. Use `migrateInstruction()` to move it to the AMM.

**Worked example** — typical initial reserves:

| Parameter | Value |
|-----------|-------|
| `initialVirtualTokenReserves` | 1,073,000,000,000,000 |
| `initialVirtualSolReserves` | 30,000,000,000 (30 SOL) |
| `initialRealTokenReserves` | 793,100,000,000,000 |
| `tokenTotalSupply` | 1,000,000,000,000,000 (1B tokens) |

Initial price ≈ `30 × 10^9 / 1.073 × 10^15 ≈ 0.000028 SOL/token`. Buying with 0.1 SOL yields ~3.56 trillion tokens (ignoring fees).

### Fee Tiers

Each trade incurs two fees:

| Fee Type | Recipient |
|----------|-----------|
| Protocol fee | Pump protocol treasury |
| Creator fee | Token creator (or fee-sharing config) |

Both are **basis points (bps)** — 1 bps = 0.01%. LP fees only apply after graduation.

**Tier selection:**

1. If `FeeConfig` is available, walk `feeTiers` (highest threshold first) to find the matching tier by `marketCap`.
2. If `FeeConfig` is null, fall back to `global.feeBasisPoints` / `global.creatorFeeBasisPoints`.

```typescript
interface FeeConfig {
  admin: PublicKey;
  flatFees: Fees;
  feeTiers: FeeTier[];
}

interface FeeTier {
  marketCapLamportsThreshold: BN;
  fees: Fees;
}

interface Fees {
  lpFeeBps: BN;
  protocolFeeBps: BN;
  creatorFeeBps: BN;
}
```

Creator fees only apply when a creator address is set on the bonding curve. Protocol fees route through `getStaticRandomFeeRecipient()` (or `reservedFeeRecipients` in mayhem mode).

### Fee Sharing

Split creator fees among **up to 10 shareholders** in basis points (10,000 bps = 100%).

```typescript
const createIx = await PUMP_SDK.createFeeSharingConfig({
  creator, mint,
  pool: null,                  // null for bonding curve, pool PDA for graduated tokens
});

const updateIx = await PUMP_SDK.updateFeeShares({
  authority: creator,
  mint,
  currentShareholders: [],
  newShareholders: [
    { address: walletA, shareBps: 5000 }, // 50%
    { address: walletB, shareBps: 3000 }, // 30%
    { address: walletC, shareBps: 2000 }, // 20%
  ],
});
```

**Validation rules:**

| Rule | Error |
|------|-------|
| At least 1 shareholder | `NoShareholdersError` |
| Maximum 10 shareholders | `TooManyShareholdersError` |
| No zero shares | `ZeroShareError` |
| Shares sum to 10,000 bps | `InvalidShareTotalError` |
| No duplicate addresses | `DuplicateShareholderError` |

**Distribute:**

```typescript
const { instructions, isGraduated } =
  await onlineSdk.buildDistributeCreatorFeesInstructions(mint);
```

For graduated tokens this automatically calls `transferCreatorFeesToPump` first.

**Authority management:**

- `transferFeeSharingAuthorityInstruction` — move admin control
- `resetFeeSharingConfigInstruction` — reset config + assign new admin
- `revokeFeeSharingAuthorityInstruction` — irreversibly lock shareholders

### Social Fees

Assign fee shares to people by **GitHub username** (no wallet needed up front).

```
Platform enum: Pump=0 (reserved), X=1 (reserved), GitHub=2 ✅ supported
```

```typescript
import { socialFeePda, Platform } from "@nirholas/pump-sdk";

const pda = socialFeePda("12345", Platform.GitHub);

const createIx = await PUMP_SDK.createSocialFeePdaInstruction({
  payer, userId: "12345", platform: Platform.GitHub,
});

const claimIx = await PUMP_SDK.claimSocialFeePdaInstruction({
  recipient, socialClaimAuthority, userId: "12345", platform: Platform.GitHub,
});

const ixs = await PUMP_SDK.updateSharingConfigWithSocialRecipients({
  authority, mint, currentShareholders,
  newShareholders: [
    { address: walletA, shareBps: 5000 },
    { userId: "12345", platform: Platform.GitHub, shareBps: 3000 },
    { userId: "67890", platform: Platform.GitHub, shareBps: 2000 },
  ],
});

interface SocialFeePda {
  userId: string;
  platform: number;
  claimable: BN;
  lifetimeClaimed: BN;
  bump: number;
}
```

> **Important:** `userId` must be the numeric GitHub user ID from `https://api.github.com/users/<username>` (the `id` field), not the username string.

### Cashback

Volume-based SOL rebate. Opt-in per trade.

```typescript
// Bonding curve
await PUMP_SDK.sellInstructions({ ..., cashback: true });
await PUMP_SDK.createV2AndBuyInstructions({ ..., cashback: true });

// AMM
await PUMP_SDK.ammBuyInstruction({ ..., cashback: true });
await PUMP_SDK.ammBuyExactQuoteInInstruction({ ..., cashback: true });
await PUMP_SDK.ammSellInstruction({ ..., cashback: true });

// Claim
await PUMP_SDK.claimCashbackInstruction({ user });       // bonding curve
await PUMP_SDK.ammClaimCashbackInstruction({ user });    // AMM

// Admin toggle
await PUMP_SDK.toggleCashbackEnabledInstruction({ authority, enabled: true });
```

Trade events carry `cashbackFeeBasisPoints` and `cashback`.

### Token Incentives

Volume-based token rewards distributed daily.

```typescript
// One-time setup per user
const init = await PUMP_SDK.initUserVolumeAccumulator({ payer, user });

// Check
const total = await sdk.getTotalUnclaimedTokensBothPrograms(user);
const today = await sdk.getCurrentDayTokensBothPrograms(user);

// Claim
const instructions = await sdk.claimTokenIncentivesBothPrograms(user, payer);

// Sync / close
const syncIxs = await sdk.syncUserVolumeAccumulatorBothPrograms(user);
const closeIx = await PUMP_SDK.closeUserVolumeAccumulator(user);
```

Accounts:

```typescript
interface GlobalVolumeAccumulator {
  startTime: BN;
  endTime: BN;
  secondsInADay: BN;
  mint: PublicKey;
  totalTokenSupply: BN[];
  solVolumes: BN[];
}

interface UserVolumeAccumulator {
  user: PublicKey;
  needsClaim: boolean;
  totalUnclaimedTokens: BN;
  totalClaimedTokens: BN;
  currentSolVolume: BN;
  lastUpdateTimestamp: BN;
}
```

### Mayhem Mode

Alternate operating mode — set at token creation, **cannot be changed**. Uses separate PDAs, fee recipients, and Token-2022 vaults under the Mayhem program.

| Aspect | Normal Mode | Mayhem Mode |
|--------|-------------|-------------|
| Token vault | Standard bonding curve ATA | `getTokenVaultPda(mint)` |
| SOL vault | Standard Pump SOL vault | `getSolVaultPda()` |
| Token program | `TOKEN_PROGRAM_ID` | `TOKEN_2022_PROGRAM_ID` |
| Mayhem state | Not used | `getMayhemStatePda(mint)` |
| Global params | Not used | `getGlobalParamsPda()` |
| Fee recipients | `global.feeRecipient(s)` | `global.reservedFeeRecipient(s)` |

```typescript
await PUMP_SDK.createV2Instruction({ ..., mayhemMode: true });

const bc = await sdk.fetchBondingCurve(mint);
if (bc.isMayhemMode) { /* ... */ }
```

In mayhem mode, the actual `mintSupply` from the bonding curve is used for fee-tier computation instead of `ONE_BILLION_SUPPLY`. Otherwise buy/sell math is identical.

### AMM Trading

After graduation, trade through `PumpAMM`.

```typescript
// Buy (specify token output)
await PUMP_SDK.ammBuyInstruction({
  user, pool, mint,
  baseAmountOut: new BN(1_000_000),
  maxQuoteAmountIn: new BN(100_000),
  cashback: false,
});

// Buy exact quote
await PUMP_SDK.ammBuyExactQuoteInInstruction({
  user, pool, mint,
  quoteAmountIn: new BN(100_000),
  minBaseAmountOut: new BN(900_000),
});

// Sell
await PUMP_SDK.ammSellInstruction({
  user, pool, mint,
  baseAmountIn: new BN(1_000_000),
  minQuoteAmountOut: new BN(90_000),
});

// Deposit
await PUMP_SDK.ammDepositInstruction({
  user, pool, mint,
  maxBaseAmountIn: new BN(1_000_000),
  maxQuoteAmountIn: new BN(100_000),
  minLpTokenAmountOut: new BN(50_000),
});

// Withdraw
await PUMP_SDK.ammWithdrawInstruction({
  user, pool, mint,
  lpTokenAmountIn: new BN(50_000),
  minBaseAmountOut: new BN(900_000),
  minQuoteAmountOut: new BN(80_000),
});

// Creator fees on the AMM
await PUMP_SDK.ammCollectCoinCreatorFeeInstruction({ creator });
await PUMP_SDK.ammTransferCreatorFeesToPumpInstruction({ coinCreator: creator });
await PUMP_SDK.ammSetCoinCreatorInstruction({ pool, mint });
await PUMP_SDK.ammMigratePoolCoinCreatorInstruction({ pool, mint });
```

Pool lookup:

```typescript
const pool = await onlineSdk.fetchPool(mint);
const [poolAddress] = poolPda(mint);
```

### Admin Operations

```typescript
await PUMP_SDK.toggleMayhemModeInstruction({ authority, enabled: true });
await PUMP_SDK.toggleCashbackEnabledInstruction({ authority, enabled: true });
await PUMP_SDK.toggleCreateV2Instruction({ authority, enabled: true });

await PUMP_SDK.updateGlobalAuthorityInstruction({ authority, newAuthority }); // ⚠️ irreversible
await PUMP_SDK.setReservedFeeRecipientsInstruction({ authority, whitelistPda });

// Permissionless
await PUMP_SDK.setMetaplexCreatorInstruction({ mint });
await PUMP_SDK.migrateBondingCurveCreatorInstruction({ mint });
```

`AdminSetCreatorEvent` is emitted when the admin overrides a token's creator.

### Analytics

Pure functions — run offline given bonding curve state.

```typescript
import {
  calculateBuyPriceImpact,
  calculateSellPriceImpact,
  getGraduationProgress,
  getTokenPrice,
  getBondingCurveSummary,
  bondingCurveMarketCap,
} from "@nirholas/pump-sdk";

interface PriceImpactResult {
  priceBefore: BN;
  priceAfter: BN;
  impactBps: number;
  outputAmount: BN;
}

interface GraduationProgress {
  progressBps: number;       // 0–10000
  isGraduated: boolean;
  tokensRemaining: BN;
  tokensTotal: BN;
  solAccumulated: BN;
}

interface TokenPriceInfo {
  buyPricePerToken: BN;
  sellPricePerToken: BN;
  marketCap: BN;
  isGraduated: boolean;
}

interface BondingCurveSummary {
  marketCap: BN;
  progressBps: number;
  isGraduated: boolean;
  buyPricePerToken: BN;
  sellPricePerToken: BN;
  realSolReserves: BN;
  realTokenReserves: BN;
  virtualSolReserves: BN;
  virtualTokenReserves: BN;
}
```

Online wrappers:

```typescript
const sdk = new OnlinePumpSdk(connection);

await sdk.fetchBondingCurveSummary(mint);
await sdk.fetchGraduationProgress(mint);
await sdk.fetchTokenPrice(mint);
await sdk.fetchBuyPriceImpact(mint, new BN(1e9));
await sdk.fetchSellPriceImpact(mint, new BN(1_000_000));
await sdk.isGraduated(mint);
await sdk.getTokenBalance(mint, user);
await sdk.sellAllInstructions({ mint, user, slippage: 1 });
```

### Events Reference

Complete catalog of events emitted by Pump, PumpAMM, and PumpFees.

**Pump program:**

| Event | Decoder | Notes |
|-------|---------|-------|
| `TradeEvent` | `decodeTradeEvent` | Every bonding curve buy/sell — includes `mayhemMode`, `cashbackFeeBasisPoints`, `cashback`, `trackVolume`, `currentSolVolume` |
| `CreateEvent` | `decodeCreateEvent` | New token — `isMayhemMode`, `isCashbackEnabled` |
| `CompleteEvent` | `decodeCompleteEvent` | Bonding curve reaches 100% |
| `CompletePumpAmmMigrationEvent` | `decodeCompletePumpAmmMigrationEvent` | Migration to AMM — includes `pool` |
| `SetCreatorEvent` | `decodeSetCreatorEvent` | Creator set/updated |
| `CollectCreatorFeeEvent` | `decodeCollectCreatorFeeEvent` | Creator collects fees |
| `AdminSetCreatorEvent` | `decodeAdminSetCreatorEvent` | Admin overrides creator |
| `MigrateBondingCurveCreatorEvent` | `decodeMigrateBondingCurveCreatorEvent` | Migrated via fee sharing config |
| `ExtendAccountEvent` | `decodeExtendAccountEvent` | Account resized |

**Token incentive events:**

`ClaimTokenIncentivesEvent`, `ClaimCashbackEvent`, `InitUserVolumeAccumulatorEvent`, `SyncUserVolumeAccumulatorEvent`, `CloseUserVolumeAccumulatorEvent`.

**PumpAMM events:**

| Event | Decoder |
|-------|---------|
| `AmmBuyEvent` | `decodeAmmBuyEvent` |
| `AmmSellEvent` | `decodeAmmSellEvent` |
| `DepositEvent` | `decodeDepositEvent` |
| `WithdrawEvent` | `decodeWithdrawEvent` |
| `CreatePoolEvent` | `decodeCreatePoolEvent` |

`AmmBuyEvent` / `AmmSellEvent` carry `baseAmountIn/Out`, `quoteAmountIn/Out`, `userQuoteAmountIn/Out`, `lpFee`, `protocolFee`, `coinCreatorFee`, `cashback`.

**PumpFees events:**

`CreateFeeSharingConfigEvent`, `UpdateFeeSharesEvent`, `DistributeCreatorFeesEvent`, `ResetFeeSharingConfigEvent`, `RevokeFeeSharingAuthorityEvent`, `TransferFeeSharingAuthorityEvent`, `SocialFeePdaCreatedEvent`, `SocialFeePdaClaimedEvent`, `MinimumDistributableFeeEvent`.

### End-to-End Workflow

```
 1. createV2Instruction()                → Token on bonding curve
 2. buyInstructions()                    → Buy tokens, price increases
 3. bondingCurveMarketCap()              → Monitor price & market cap
 4. sellInstructions()                   → Sell tokens, price decreases
 5. migrateInstruction()                 → Graduate to AMM pool
5b. ammBuyInstruction() / ammSellInstruction()  → Trade on AMM
5c. ammDepositInstruction()              → Provide liquidity
 6. collectCoinCreatorFeeInstructions()  → Collect creator fees
 7. createFeeSharingConfig()             → Set up fee sharing
 8. claimTokenIncentivesBothPrograms()   → Claim volume rewards
 9. claimCashbackInstruction()           → Claim cashback (Pump + AMM)
10. createSocialFeePdaInstruction()      → Social fee integration
```

**Create + Buy atomically:**

```typescript
const atomicIxs = await PUMP_SDK.createV2AndBuyInstructions({
  global,
  mint: mint.publicKey,
  name, symbol, uri,
  creator: wallet.publicKey,
  user: wallet.publicKey,
  amount: tokenAmount,
  solAmount,
  mayhemMode: false,
});
```

**Migrate when complete:**

```typescript
if (currentCurve.complete) {
  const migrateIx = await PUMP_SDK.migrateInstruction({
    withdrawAuthority: global.withdrawAuthority,
    mint,
    user: wallet.publicKey,
  });
  const poolAddress = canonicalPumpPoolPda(mint);
}
```

**Collect creator fees:**

```typescript
const balance = await sdk.getCreatorVaultBalanceBothPrograms(wallet.publicKey);
if (balance.gtn(0)) {
  const ixs = await sdk.collectCoinCreatorFeeInstructions(wallet.publicKey);
}
```

---

## USDC Quote Pair (V2)

> Pump.fun enabled USDC as a quote mint for create + trade on **2026-05-21**.

Important rules:

- **USDC-paired coins** can only be traded with **V2 instructions**.
- **SOL-paired coins** still trade in native SOL (quote mint passed as wSOL). Legacy instructions continue to work.
- Authoritative reference: [pump-fun/pump-public-docs](https://github.com/pump-fun/pump-public-docs).
- Local tutorials: [tutorials/46-usdc-pair-launches.md](tutorials/46-usdc-pair-launches.md), [tutorials/47-v2-creator-fees.md](tutorials/47-v2-creator-fees.md).

**Migration v1.29.0:** all buy/sell instructions now require `bonding_curve_v2` and `pool_v2` accounts. If you use the SDK's builders, nothing changes. If you construct instructions manually, add:

| Instruction | New required account | Derivation |
|-------------|---------------------|------------|
| Bonding curve `buy` / `buyExactSolIn` | `bonding_curve_v2` (readonly) | `bondingCurveV2Pda(mint)` |
| Bonding curve `sell` | `bonding_curve_v2` (readonly) | `bondingCurveV2Pda(mint)` |
| PumpAMM `buy` / `buyExactQuoteIn` / `sell` | `pool_v2` (readonly) | `poolV2Pda(baseMint)` |

For cashback coins on PumpAMM, `user_volume_accumulator_wsol_ata` is also prepended as a mutable account.

---

## RPC Best Practices

### Provider selection

| Aspect | Free (Public) | Paid Provider |
|--------|---------------|---------------|
| Rate limit | 40 req/sec (shared) | 500–5000+ req/sec |
| Reliability | ≤95% uptime, frequent 429s | ≥99.9% SLA |
| WebSocket | Often unstable | Persistent, reliable |
| Geographic | US-only | Multi-region |
| Cost | Free | $49–$500+/mo |

| Provider | Strengths | Best For |
|----------|-----------|----------|
| [Helius](https://helius.dev) | DAS API, webhooks, enhanced TX | Token metadata, analytics |
| [Alchemy](https://alchemy.com) | Reliability, multi-chain | Production apps |
| [QuickNode](https://quicknode.com) | Fastest raw RPC | Trading bots |
| [Triton](https://triton.one) | Dedicated validators, Geyser | High-frequency monitoring |

### Commitment levels

| Level | Latency | Finality | Use Case |
|-------|---------|----------|----------|
| `processed` | ~400ms | May revert | Read-after-write within same TX |
| `confirmed` | ~2–5s | 66%+ validators | **Recommended default** |
| `finalized` | ~12–15s | 31+ slots | Financial settlements, irreversible |

### Retry with backoff

```typescript
async function rpcWithRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 1000): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try { return await fn(); }
    catch (error: any) {
      if (error?.message?.includes("429") && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}
```

### Multi-provider failover

```typescript
const RPC_ENDPOINTS = [
  process.env.PRIMARY_RPC_URL,
  process.env.SECONDARY_RPC_URL,
  "https://api.mainnet-beta.solana.com",
].filter(Boolean);
```

### Caching strategy

| Data | Cache? | TTL |
|------|--------|-----|
| SOL/USD price | ✅ | 10–60s |
| Bonding curve state | ✅ | 5s |
| Token metadata | ✅ | 1 hour |
| Creator profile | ✅ | 5 min |
| Transaction status | ❌ | — |
| Account balances | ❌ | — |

### WebSocket stability

WebSocket connections drop frequently. Always implement reconnection with HTTP polling as a fallback. The Solana WebSocket times out after ~5 minutes of inactivity.

---

## Deployment

### Railway

```bash
npm install -g @railway/cli
railway login

cd packages/monitor
railway init
railway link
railway variables set TELEGRAM_BOT_TOKEN=your-token
railway variables set SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your-key
railway up
```

**Persistent storage:**

```bash
railway volume create --mount /app/data
```

**railway.json:**

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "DOCKERFILE", "dockerfilePath": "Dockerfile" },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10,
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30
  }
}
```

### Docker / Docker Compose

```bash
docker build -t pumpkit-monitor packages/monitor/
docker run -d --name pumpkit-monitor --restart unless-stopped \
  -e TELEGRAM_BOT_TOKEN=your-token \
  -e SOLANA_RPC_URL=https://your-rpc.com \
  -v pumpkit-monitor-data:/app/data \
  -p 3000:3000 pumpkit-monitor
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  monitor:
    build: packages/monitor/
    restart: unless-stopped
    env_file: packages/monitor/.env
    volumes: [monitor-data:/app/data]
    ports: ["3000:3000"]
    mem_limit: 256m
    cpus: '0.5'
  tracker:
    build: packages/tracker/
    restart: unless-stopped
    env_file: packages/tracker/.env
    volumes: [tracker-data:/app/data]
    ports: ["3001:3001"]
    mem_limit: 256m
    cpus: '0.5'
volumes:
  monitor-data:
  tracker-data:
```

### Documentation site (Vercel)

```bash
cd docs-site
npm install
npm run dev
npm run build
npx vercel --prod
```

### Environment variable reference (Monitor Bot)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ | — | BotFather token |
| `SOLANA_RPC_URL` | ✅ | — | Primary Solana RPC |
| `SOLANA_RPC_URLS` | ❌ | — | Comma-separated fallback RPCs |
| `CHANNEL_ID` | ❌ | — | Channel broadcast mode |
| `BROADCAST_ONLY` | ❌ | `false` | Disable DM commands |
| `FEED_CLAIMS` | ❌ | `true` | Enable claim alerts |
| `FEED_LAUNCHES` | ❌ | `true` | Enable launch alerts |
| `FEED_GRADUATIONS` | ❌ | `true` | Enable graduation alerts |
| `FEED_WHALES` | ❌ | `true` | Enable whale alerts |
| `FEED_CTO` | ❌ | `true` | Enable CTO alerts |
| `FEED_FEE_DISTRIBUTIONS` | ❌ | `true` | Enable fee dist alerts |
| `WHALE_THRESHOLD_SOL` | ❌ | `100` | Min SOL for whale alert |
| `API_ENABLED` | ❌ | `false` | Enable REST API |
| `API_PORT` | ❌ | `3000` | API port |
| `API_AUTH_TOKEN` | ❌ | — | API Bearer token |
| `TWITTER_BEARER_TOKEN` | ❌ | — | Twitter/X API |
| `GITHUB_TOKEN` | ❌ | — | GitHub API |
| `GROQ_API_KEY` | ❌ | — | Groq LLM |
| `ADMIN_CHAT_IDS` | ❌ | — | Admin Telegram IDs |
| `LOG_LEVEL` | ❌ | `info` | Log verbosity |

### Environment variable reference (Tracker Bot)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ | — | BotFather token |
| `DB_PATH` | ❌ | `data/tracker.sqlite` | SQLite path |
| `ATH_POLL_INTERVAL` | ❌ | `60000` | ATH poll ms |
| `DEXSCREENER_API_URL` | ❌ | `https://api.dexscreener.com` | Price API |
| `HEALTH_PORT` | ❌ | `3001` | Health check port |
| `LOG_LEVEL` | ❌ | `info` | Log verbosity |

### Monitoring in production

```bash
railway logs -f
docker logs -f pumpkit-monitor
docker logs -f pumpkit-tracker

curl http://localhost:3000/health
curl http://localhost:3001/health
```

```json
{
  "status": "ok",
  "uptime": "86400s",
  "monitors": {
    "claims": { "running": true, "lastEvent": 1710000000, "processed": 1234 },
    "launches": { "running": true, "lastEvent": 1710000100, "processed": 567 }
  }
}
```

---

## Performance & Benchmarks

### Event processing

| Metric | Value |
|--------|-------|
| Transaction processing | ~50 TX/sec per bot |
| Claim detection latency (WebSocket) | < 2s |
| Claim detection latency (polling) | < 10s |
| Telegram message rate | 30 msg/sec per bot |
| Bot command response | < 500ms |

### Telegram limits

| Scope | Limit | Mitigation |
|-------|-------|------------|
| Per bot (global) | 30 msg/sec | Queue + batch |
| Per chat (group) | 20 msg/min | Aggregate events |
| File uploads | 10 MB | PNL cards ~50KB |

### RPC benchmarks

| Operation | Calls | Latency |
|-----------|-------|---------|
| `getSignaturesForAddress` | 1 | 50–200ms |
| `getParsedTransaction` | 1 | 100–500ms |
| `getAccountInfo` | 1 | 50–200ms |
| `logsSubscribe` | stream | real-time |

### Monitor bot capacity

| Metric | Value |
|--------|-------|
| Watched wallets | Unlimited |
| Claim history buffer | 50K entries (LRU) |
| Memory baseline | ~50MB |
| Memory per 1K watches | ~2MB |

### REST API performance

| Endpoint | Latency | Rate Limit |
|----------|---------|------------|
| `GET /api/v1/health` | < 5ms | Unlimited |
| `GET /api/v1/claims` | < 50ms | 100 req/min |
| `GET /api/v1/claims/stream` (SSE) | Real-time | 10 concurrent |
| `GET /api/v1/watches` | < 10ms | 100 req/min |
| `POST /api/v1/watches` | < 20ms | 100 req/min |
| Webhook dispatch | < 100ms | Per event |

### SQLite (tracker)

| Operation | Latency |
|-----------|---------|
| Insert call | < 1ms |
| Leaderboard query | < 5ms |
| User lookup | < 1ms |
| ATH update batch | < 10ms |

### Channel bot feeds (typical)

| Feed | Events/Hour |
|------|-------------|
| Token Launches | 200–500 |
| Graduations | 10–50 |
| Whale Trades | 50–200 |
| Fee Claims | 20–100 |

### Cold start

| Component | Build | Container start | First event |
|-----------|-------|-----------------|-------------|
| Monitor Bot | ~30s | < 2s | < 5s |
| Tracker Bot | ~45s (canvas) | < 2s | < 3s |
| Channel Bot | ~30s | < 2s | < 5s |

### Optimization checklist

- [ ] WebSocket primary + HTTP polling fallback
- [ ] Multiple RPC endpoints with failover
- [ ] Poll intervals: 60s tracking, 5s launches
- [ ] SQLite WAL mode (tracker — on by default)
- [ ] LRU caches for API responses
- [ ] Telegram queue respects rate limits
- [ ] Health endpoint for degraded-state detection
- [ ] Railway autoscaling for spikes

---

## Security Model

### Core principles

1. **Official crypto only** — `solana-sdk` (Rust), `@solana/web3.js` (TS), `solana-keygen` (shell). No third-party crypto.
2. **Key material lifecycle:** Generate → Use → Zeroize. Files written with `0600`. Never log, print, or return private keys.
3. **Offline key generation:** no network calls during keypair creation, vanity search, file writing, or signing.

### SDK-level rules

- All financial amounts use `BN` (bn.js) — never JS `number` (precision loss above `2^53`).
- Input validation: Base58 public keys, BN bounds, slippage 0–100%, fee shares summing to 10,000 bps.
- Instruction builders return `TransactionInstruction[]`. Signing is always the caller's responsibility.
- No private keys ever enter the SDK — only `PublicKey` references.

### Vanity generator hardening

```rust
struct SecureBytes(Vec<u8>);
impl Drop for SecureBytes { fn drop(&mut self) { self.0.zeroize(); } }
```

- `zeroize` crate clears key material on drop
- No unjustified `unsafe`
- Files written with `0600` permissions
- No debug output of secret bytes
- Per-thread CSPRNG state via `rayon`

### File permissions

```bash
ls -la keypair.json     # should show -rw-------
chmod 600 keypair.json
./tools/check-file-permissions.sh
```

### Bot security boundaries

- No private keys handled by bots — read-only monitoring
- Telegram bot tokens stored in `.env`, never committed
- RPC URLs treated as secrets (rate-limited endpoints)
- API auth via Bearer token (optional)
- Rate limiting on Telegram commands and API endpoints
- SQLite WAL mode for concurrent reads

### Dependency auditing

```bash
npm audit
cargo audit
```

Both run in CI on every PR and weekly. High-severity vulnerabilities block PRs.

### Reporting

1. Do **not** open a public GitHub issue
2. Use [GitHub Security Advisories](https://github.com/nirholas/pump-fun-sdk/security/advisories)
3. Or contact the maintainer directly
4. Allow up to 90 days for a fix before disclosure

See [SECURITY.md](SECURITY.md).

---

## CLI Guide — Vanity Addresses

### Quick start

```bash
solana-keygen grind --starts-with Sol:1
solana-keygen grind --starts-with Sol:1 --ignore-case
./tools/generate-vanity.sh Sol
```

### Base58 character set

Valid: `123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz`. Excluded: `0`, `O`, `I`, `l`.

### Time estimates

| Length | Case-Sensitive | Case-Insensitive |
|--------|---------------|-------------------|
| 1 char | < 1 second | < 1 second |
| 2 chars | < 1 second | < 1 second |
| 3 chars | ~2 seconds | < 1 second |
| 4 chars | ~2 minutes | ~30 seconds |
| 5 chars | ~2 hours | ~30 minutes |
| 6 chars | ~5 days | ~1 day |
| 7 chars | ~300 days | ~100 days |
| 8+ chars | Years | Years |

### PumpKit wrappers

```bash
./tools/generate-vanity.sh [OPTIONS] <prefix>
  -s, --suffix <str>    Also match a suffix
  -c, --count <n>       Number of addresses (default: 1)
  -o, --output <dir>    Output directory (default: .)
  -t, --threads <n>     Thread count (default: all cores)
  -i, --ignore-case     Case-insensitive matching
  -e, --encrypt         Encrypt output with GPG
  -b, --backup          Create timestamped backup
  -n, --no-outfile      Print to stdout (INSECURE)

./tools/batch-generate.sh prefixes.txt
./tools/batch-generate.sh -j 4 -o ./keys prefixes.txt
```

### Secure deletion

```bash
# Linux
shred -vfz -n 3 my-keypair.json && rm -f my-keypair.json
# macOS
gshred -vfz -n 3 my-keypair.json && rm -f my-keypair.json
# Fallback
dd if=/dev/urandom of=my-keypair.json bs=1 count=$(wc -c < my-keypair.json)
rm -f my-keypair.json
```

---

## Error Reference

### Fee sharing errors

| Error | Cause | Fix |
|-------|-------|-----|
| `NoShareholdersError` | Empty shareholders array | Provide at least one |
| `TooManyShareholdersError` | More than 8 shareholders | Reduce to ≤ 8 |
| `ZeroShareError` | Zero or negative share | Use positive shares only |
| `InvalidShareTotalError` | Shares don't sum to 10,000 bps | Adjust to total 10,000 |
| `DuplicateShareholderError` | Duplicate address | Merge entries |
| `ShareCalculationOverflowError` | Internal arithmetic overflow | Reduce share values; file an issue |

### Handling

```typescript
import {
  NoShareholdersError,
  TooManyShareholdersError,
  ZeroShareError,
  InvalidShareTotalError,
  DuplicateShareholderError,
} from "@nirholas/pump-sdk";

try {
  const ixs = await sdk.createFeeSharingConfigInstruction({ authority, mint, shareholders });
} catch (err) {
  if (err instanceof InvalidShareTotalError) console.error(`Total ${err.total}, need 10000`);
  else if (err instanceof TooManyShareholdersError) console.error(`${err.count}, max ${err.max}`);
  else if (err instanceof ZeroShareError) console.error(`Zero share for ${err.address}`);
}
```

### On-chain errors

| Error | Program | Cause |
|-------|---------|-------|
| `InsufficientFunds` | Pump | Not enough SOL for buy |
| `SlippageExceeded` | Pump/PumpAMM | Price moved beyond tolerance |
| `BondingCurveComplete` | Pump | Token already graduated — use AMM |
| `Unauthorized` | All | Wrong authority/signer |
| `AccountNotFound` | All | PDA doesn't exist yet |

---

## Troubleshooting

### Installation

- `Cannot find module '@pumpkit/core'` → `npm install` from repo root
- TS compile errors → `rm -rf packages/*/dist && npm run build`

### Telegram bot

- **Not responding:** verify token via `curl https://api.telegram.org/bot<TOKEN>/getMe`; make sure no other instance is polling; check `LOG_LEVEL=debug` output
- **Channel not posting:** bot must be a channel admin with "Post Messages"; `TELEGRAM_CHANNEL_ID` needs `-100` prefix for supergroups
- **Rate limited:** batch messages, combine via `parse_mode: HTML`, filter noise
- **`GrammyError: Call to 'sendMessage' failed`:** bot removed, message > 4096 chars, invalid HTML, or user blocked the bot

### Solana RPC

- `429 Too Many Requests`: use paid provider, batch with `getMultipleAccountsInfo`, add backoff
- `failed to get info about account`: bonding curve doesn't exist yet / wrong mint / token closed
- WebSocket drops: auto-reconnect, use `confirmed` commitment, have HTTP polling fallback

### Railway

- Build fails: check `Dockerfile` in package root, verify `outDir`/`CMD` paths, env vars set in dashboard
- `ENOMEM` on Hobby (512MB): `--max-old-space-size=384`, reduce concurrent RPC, use SQLite for large datasets
- Health check failing: ensure `/health` endpoint reachable, port matches

### Claim detection

- Verify all 3 program IDs are monitored
- Log raw transactions to confirm decoder behavior
- Use `confirmed`/`finalized` commitment, not `processed`
- One social fee PDA can be a shareholder in multiple `SharingConfig` accounts — the `SocialFeeIndex` maps PDA → set of mints, highest market cap token displays as primary
- After redeploy, persist claim state to disk or cross-check via `getCreatorVaultBalanceBothPrograms`

---

## Glossary

### Pump Protocol

| Term | Definition |
|------|-----------|
| **Bonding Curve** | Mathematical pricing function where price increases with supply purchased. Constant-product `k = virtualSolReserves × virtualTokenReserves`. |
| **Graduation** | When the curve has received enough SOL, `bondingCurve.complete = true` and the token migrates to a PumpAMM pool. |
| **Migration** | Process of moving a graduated token from the curve to the AMM. Liquidity is seeded automatically. |
| **PumpAMM** | Pump's AMM. Handles post-graduation trading. `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA`. |
| **PumpFees** | Fee program managing dynamic fee tiers and creator fee distribution. `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ`. |
| **CTO** | Creator Takeover — when a token's fee recipient is changed. |
| **Mayhem Mode** | Alternate fee routing mode set at creation. Token-2022 + reserved fee recipients. |
| **Fee Sharing** | Splitting creator fees among up to 10 shareholders (basis points). |
| **Social Fees** | Fee collection via social identity (e.g., GitHub) instead of a wallet. |
| **Cashback** | Volume-based PUMP rewards — opt-in per trade. |
| **Fee Tier** | Dynamic fee rates based on a pool's market cap. |

### Solana

| Term | Definition |
|------|-----------|
| **SOL** | Solana native token. 1 SOL = 1,000,000,000 lamports. |
| **Lamports** | Smallest unit of SOL. |
| **PDA** | Program Derived Address — deterministic, not a keypair. |
| **RPC** | Remote Procedure Call API for Solana state. |
| **WebSocket (WSS)** | Persistent connection for real-time events. |
| **Transaction Instruction** | Single operation in a Solana transaction. |
| **SPL Token** | Solana Program Library Token — standard token program. |
| **Token-2022** | Newer token program with extended features. Used by mayhem mode. |

### Telegram bot

| Term | Definition |
|------|-----------|
| **grammy** | TypeScript Telegram framework used by PumpKit. |
| **BotFather** | Telegram's official bot for creating bot tokens. |
| **Polling** | Long-polling mode — bot asks Telegram for updates. |
| **Webhook** | Telegram pushes updates to your server via HTTP POST. |
| **Chat ID** | Unique identifier for a DM, group, or channel. |
| **Parse Mode** | `HTML` — PumpKit uses HTML formatting. |
| **Channel** | Broadcast-only Telegram chat. |

### Tracker bot

| Term | Definition |
|------|-----------|
| **Call** | A user's token pick tracked by pasting a CA. |
| **ATH** | All-Time High after the call. |
| **Multiplier** | ATH price ÷ entry price. |
| **PNL Card** | Shareable image showing entry, ATH, gain. |
| **Win Rate** | Percentage of calls that hit ≥ 2×. |
| **Points** | Reputation score from −1 to +5. |
| **Rank** | Tier: Amateur → Novice → Contender → Guru → Oracle. |
| **Hardcore Mode** | Auto-kick below minimum win rate. |
| **Auto Mode** | Calls auto-registered on CA detection. |
| **Button Mode** | Manual confirm via alpha/gamble buttons. |

### Financial math

| Term | Definition |
|------|-----------|
| **BN** | bn.js — arbitrary-precision integers. |
| **BPS** | Basis Points — 1 BPS = 0.01%. Shares sum to 10,000 BPS. |
| **Slippage** | Maximum acceptable price movement. |
| **Price Impact** | How much a trade moves the price (bps). |
| **Virtual Reserves** | Virtual SOL/token amounts in the curve. |
| **Real Reserves** | Actual SOL/tokens in the curve. |
| **Market Cap** | `tokenPrice × totalSupply`. |

### Infrastructure

| Term | Definition |
|------|-----------|
| **Turborepo** | Monorepo build orchestrator with caching. |
| **Railway** | Cloud hosting platform (~$5/mo Hobby). |
| **SSE** | Server-Sent Events — one-way HTTP streaming. |
| **Webhook** | Outbound HTTP POST on event. |
| **Health Check** | `GET /health` endpoint. |
| **DexScreener** | Price data API used by the tracker bot. |

---

## FAQ

### General

**Is this the official PumpFun SDK?** This is the official community PumpFun SDK, published as `@nirholas/pump-sdk`. Reverse-engineered from the on-chain programs; IDLs extracted directly from deployed programs.

**Is it free?** Yes, MIT licensed.

**Languages?** TypeScript/JavaScript (core), Rust (vanity), Shell (tools).

### Installation

```bash
npm install @nirholas/pump-sdk
npm install @solana/web3.js @coral-xyz/anchor @solana/spl-token bn.js
```

Works with yarn / pnpm / bun. Node 18+, latest LTS recommended.

**Browser?** Core SDK works in browser. File-based keypair storage is Node-only.

### SDK usage

`PumpSdk` vs `OnlinePumpSdk`:

| | `PumpSdk` | `OnlinePumpSdk` |
|--|----------|------------------|
| Needs connection? | No | Yes |
| Builds instructions? | Yes | Yes |
| Fetches on-chain state? | No | Yes |
| Singleton? | `PUMP_SDK` | `new OnlinePumpSdk(connection)` |

**Slippage** — Max % price movement; `1` = 1%. Transaction reverts if exceeded.

**What happens when a token graduates?** `bondingCurve.complete === true`, trading uses the AMM, creator fees still collected (from AMM), use `transferCreatorFeesToPump` before claiming. SDK methods with `BothPrograms` handle this automatically.

**Devnet?** Yes — pass a devnet connection to `OnlinePumpSdk`.

### Fee sharing

**Can shareholders change?** Yes, via `updateFeeShares`, unless admin authority has been revoked.

**Without fee sharing?** All creator fees go to the creator's vault.

### Vanity addresses

See [CLI Guide](#cli-guide--vanity-addresses). Safe — official Solana keygen, zeroized memory.

### MCP server

**What is MCP?** Model Context Protocol — Anthropic's open standard for connecting AI assistants to tools.

**Tools available:** 53, covering quoting, transaction building, fees, analytics, AMM, social fees, wallet ops.

```json
{
  "mcpServers": {
    "pump-sdk": {
      "command": "node",
      "args": ["/path/to/pumpkit/mcp-server/dist/index.js"]
    }
  }
}
```

**Hosted deploy?** Yes — Railway, Cloudflare Workers, or Vercel.

**Private keys safe?** Never logged, zeroized on shutdown, never exposed through MCP resources.

### Security

**Production-ready?** SDK is in production use. Always review key-handling code, run the security checklist, test on devnet first, never commit keypair files.

**Reporting vulns?** See [SECURITY.md](SECURITY.md). Use GitHub Security Advisories.

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). AI agents welcome.

---

## Migration Guide (SDK Versions)

### v1.29.0 (Latest — 2026-03-06)

**Breaking:** all buy/sell instructions require `bonding_curve_v2` and `pool_v2` accounts. SDK handles automatically; manual builders must add them. See [USDC Quote Pair (V2)](#usdc-quote-pair-v2).

**New:** `bondingCurveV2Pda(mint)`, `poolV2Pda(baseMint)`, optional `cashback` on AMM buy/sell.

```bash
npm install @nirholas/pump-sdk@latest
```

### v1.28.0 (2026-02-26) — feature release

No breaking changes. Added: analytics functions, social fee instructions, AMM/Deposit/Withdraw/CreatePool events, fee sharing events, 19 tutorials, WebSocket relay, live dashboards, x402, channel bot, DeFi agents.

### v1.27.x — breaking changes

- `createInstruction` → `createV2Instruction` (deprecated removed in 2.0)
- Fee math signature: `getBuyTokenAmountFromSolAmount`/`getSellSolAmountFromTokenAmount`/`getBuySolAmountFromTokenAmount` now take `{ global, feeConfig, mintSupply, bondingCurve, amount }`.

```typescript
const feeConfig = await sdk.fetchFeeConfig();
const tokens = getBuyTokenAmountFromSolAmount({
  global, feeConfig,
  mintSupply: bondingCurve.tokenTotalSupply,
  bondingCurve, amount: solAmount,
});
```

### Version summary

| Version | Date | Type | Key Changes |
|---------|------|------|-------------|
| v1.29.0 | 2026-03-06 | Breaking | V2 PDAs required on buy/sell |
| v1.28.0 | 2026-02-26 | Feature | Analytics, tutorials, bots, dashboards, x402, social fees |
| v1.27.x | — | Breaking | `createV2Instruction`, fee config parameter |
| v1.0.0 | 2026-02-11 | Initial | Core SDK, vanity, MCP server |

---

## Ecosystem at a Glance

| Component | Directory | Language | What it is |
|-----------|-----------|----------|------------|
| Core SDK | `src/` (`@nirholas/pump-sdk`) | TypeScript | Instruction builders for the entire Pump protocol |
| Telegram Bot | `telegram-bot/` | TS / grammy | DM + REST API + webhooks |
| Channel Bot | `channel-bot/` | TS / grammy | Read-only channel feed |
| WebSocket Relay | `websocket-server/` | TS | Real-time token launch relay |
| Live Dashboards | `live/` | HTML/JS | Self-contained browser dashboards |
| Rust Vanity Generator | `rust/` | Rust | ~100K keys/sec, hardened |
| TypeScript Vanity Generator | `typescript/` | TS | Reference implementation |
| x402 Payments | `x402/` | TS | HTTP 402 micropayments for Solana USDC |
| Shell Scripts | `scripts/` | Bash | Production wrappers around `solana-keygen` |
| Tutorials | `tutorials/` | Markdown | 45+ progressive guides |
| DeFi Agents | `packages/defi-agents/` | JSON | 43 AI agent definitions |
| PumpOS | `site/` | HTML/CSS/JS | Web desktop with 169 apps |
| Security | `security/` | Markdown | 60+ item audit checklist |

Component dependency view:

```
                    ┌─────────────────┐
                    │   Core SDK      │
                    └────┬──┬──┬─────┘
                         │  │  │
            ┌────────────┘  │  └────────────┐
            ▼               ▼               ▼
     ┌─────────────┐ ┌──────────┐ ┌────────────────┐
     │ Telegram Bot │ │ Channel  │ │ MCP Server     │
     │              │ │ Bot      │ │ (53 tools)     │
     └──────────────┘ └──────────┘ └────────────────┘

     ┌──────────────┐ ┌──────────┐ ┌────────────────┐
     │ WebSocket    │ │ Live     │ │ Vanity Gens    │
     │ Relay        │◄│ Dash-    │ │ (Rust + TS)    │
     │              │ │ boards   │ │                │
     └──────────────┘ └──────────┘ └────────────────┘

     ┌──────────────┐ ┌──────────┐ ┌────────────────┐
     │ x402 Payments│ │ DeFi     │ │ Plugin         │
     │              │ │ Agents   │ │ Delivery       │
     └──────────────┘ └──────────┘ └────────────────┘
```

---

## PumpOS Web Desktop (optional)

A web-based desktop environment built around the Pump SDK. Windows, taskbar, app store, virtual filesystem, PWA, offline-capable.

| Category | Examples |
|----------|----------|
| DeFi & Trading | Fee Manager, Token Creator, Token Trader, Portfolio Tracker, Swap, Wallet |
| Analytics | Bonding Curve Viewer, Price Charts, Whale Tracker, Market Overview |
| Utilities | Vanity Generator, Address Lookup, TX Explorer, Settings |
| Information | Documentation, Tutorials, News Feed |

Apps are self-contained HTML in `site/Pump-Store/apps/` or `site/screens/`. They communicate with the shell via `postMessage`. Storage via `localStorage`, `sessionStorage`, virtual FS, or IndexedDB.

Security rules:

- Keys never leave the browser — all crypto operations client-side
- No external requests without user consent
- Sanitize all user input
- Use `@solana/web3.js` only

Deploy via Vercel (`cd site && vercel --prod`) or GitHub Pages. PumpOS installs as a PWA.

---

## DeFi Agents (optional)

43 AI agent definitions in `packages/defi-agents/` — compatible with SperaxOS and any function-calling LLM platform.

| Category | Count | Focus |
|----------|-------|-------|
| Master Agents | 3 | Multi-tool orchestrators |
| Ecosystem Agents | 5+ | Chain-specific analysis |
| Portfolio Agents | 5+ | Asset management & tracking |
| General DeFi Agents | 10+ | Yields, swaps, staking |
| Security Agents | 5+ | Auditing & threat detection |
| Crypto News Agents | 3+ | News & regulatory monitoring |

```json
{
  "id": "agent-id",
  "name": "Agent Display Name",
  "avatar": "🤖",
  "description": "What this agent does",
  "systemPrompt": "You are an AI assistant specializing in...",
  "plugins": ["pump-fun-sdk", "coingecko"],
  "category": "defi",
  "createdAt": "2026-03-06T00:00:00Z"
}
```

Plugin reference:

| Plugin | Status |
|--------|--------|
| `pump-fun-sdk` | ✅ |
| `coingecko` | ✅ |
| `defillama` | ✅ |
| `dexscreener` | ✅ |
| `beefy` | ✅ |
| `lido` | ✅ |
| `oneinch` | ✅ |
| `thegraph` | ✅ |
| `address-labels` | 🚧 |
| `contract-scanner` | 🚧 |
| `phishing-detector` | 🚧 |
| `grants-finder` | 🚧 |
| `gas-estimator` | 🚧 |

---

## Vision

> The next billion blockchain transactions will be executed by AI agents, not humans clicking buttons.

For that to happen, agents need:

1. **SDKs that work programmatically** — libraries that build and submit transactions, not UIs
2. **Natural language interfaces** — MCP servers that turn "buy 0.1 SOL of this token" into the exact instruction set
3. **Security by default** — official cryptographic libraries, memory-safe key management, zero-knowledge of private keys
4. **Open-source transparency** — every line of code that touches money should be auditable

### Principles

1. **Open source forever** — MIT licensed, always
2. **Official libraries only** — no third-party crypto, ever
3. **Agent-first design** — if an agent can't use it, redesign it
4. **Security is non-negotiable** — audit everything, zero trust by default
5. **Community over competition** — we win by making the ecosystem better, not by gatekeeping
6. **Ship fast, iterate faster** — rough consensus, running code

---

## Roadmap

| Status | Meaning |
|--------|---------|
| ✅ Done | Shipped and available |
| 🚧 In Progress | Actively being worked on |
| 📋 Planned | Scoped and scheduled |
| 💡 Exploring | Under research |

### Phase 1 — Foundation ✅

| Feature | Status | Details |
|---------|--------|---------|
| Monorepo setup | ✅ Done | Turborepo with 6 packages |
| `@pumpkit/core` | ✅ Done | Shared utilities |
| `@pumpkit/monitor` | ✅ Done | All-in-one monitor |
| `@pumpkit/tracker` | ✅ Done | Group call-tracking bot |
| `@pumpkit/channel` | ✅ Done | Read-only Telegram channel feed |
| `@pumpkit/claim` | ✅ Done | Fee claim tracker |
| Documentation | ✅ Done | 20+ docs, 30 tutorials |
| Railway deployment | ✅ Done | Dockerfiles and configs for all bots |

### Phase 2 — npm Publishing 🚧

| Feature | Status |
|---------|--------|
| npm organization | 🚧 In Progress |
| Package versioning | 📋 Planned |
| CI/CD publish pipeline | 📋 Planned |
| README badges | 📋 Planned |
| Peer dependency alignment | 📋 Planned |

### Phase 3 — Frontend UI 📋

| Feature | Status |
|---------|--------|
| `@pumpkit/web` | 📋 Planned |
| Claim feed viewer | 📋 Planned |
| Bot status dashboard | 📋 Planned |
| Token analytics | 📋 Planned |
| Configuration UI | 💡 Exploring |

### Phase 4 — Ecosystem Growth 💡

| Feature | Status |
|---------|--------|
| Plugin system | 💡 Exploring |
| Multi-chain support | 💡 Exploring |
| Alert routing (Discord, Slack) | 💡 Exploring |
| Hosted bots (one-click) | 💡 Exploring |
| AI-powered insights | 💡 Exploring |

---

## Origins

PumpKit was extracted from the [pump-fun-sdk](https://github.com/nirholas/pump-fun-sdk) Telegram bot ecosystem — 4 production bots with 50+ source files consolidated into a clean, reusable framework.

## License

[Apache License, Version 2.0](LICENSE) — Copyright © 2025–2026 nirholas ([nichxbt](https://x.com/nichxbt)).

When redistributing, see [NOTICE](NOTICE) for the required attribution.

## Author

Developed by **nirholas** / **nichxbt**

- X (Twitter): [x.com/nichxbt](https://x.com/nichxbt)
- GitHub: [github.com/nirholas](https://github.com/nirholas)
