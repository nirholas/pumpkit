# Agent Task 17: Create Example Bots (Starter Templates)

## Context

We're building **PumpKit** (`/workspaces/pump-fun-sdk/pumpkit/`). Read `pumpkit/README.md` and `pumpkit/docs/getting-started.md`.

We need 4 minimal example bots to show developers how to use the framework.

## Task

Create 4 example bots under `/workspaces/pump-fun-sdk/pumpkit/examples/`:

### 1. `examples/claim-alert/`
**Minimal fee claim notification bot** (simplest possible bot — ~50 lines)

Files:
- `src/index.ts` — Simple bot that watches wallets and sends claim notifications
- `package.json` — Dependencies: @pumpkit/core, dotenv
- `.env.example` — TELEGRAM_BOT_TOKEN, SOLANA_RPC_URL
- `README.md` — 10-line quickstart

Features: `/watch`, `/unwatch`, `/list` commands + claim alerts. That's it.

### 2. `examples/whale-watcher/`
**Channel-only whale trade alerter** (~40 lines)

Files:
- `src/index.ts` — Channel broadcast bot for whale trades only
- `package.json`
- `.env.example` — TELEGRAM_BOT_TOKEN, SOLANA_RPC_URL, CHANNEL_ID, WHALE_THRESHOLD_SOL
- `README.md`

Features: Posts whale trades (>X SOL) to a Telegram channel. No commands.

### 3. `examples/launch-radar/`
**New token launch detector** (~40 lines)

Files:
- `src/index.ts` — Broadcasts new PumpFun token launches to a channel
- `package.json`
- `.env.example`
- `README.md`

Features: Detects new token mints, posts to channel with name/symbol/creator/links.

### 4. `examples/graduation-alerts/`
**Graduation + milestone tracker** (~50 lines)

Files:
- `src/index.ts` — Alerts when tokens graduate from bonding curve to AMM
- `package.json`
- `.env.example`
- `README.md`

Features: Graduation alerts with token info and AMM pool links.

## Requirements for ALL examples

- Each example should be **self-contained** and runnable with just `npm install && npm run dev`
- Import from `@pumpkit/core` only
- Include proper `package.json` with `"type": "module"` and scripts
- Each README should be brief: what it does, how to run, what to configure
- ES module syntax
- Use grammy directly from @pumpkit/core re-exports (not a separate grammy import)
- Keep each example under 60 lines of TypeScript

## Do NOT

- Don't make examples complex — they're starter templates
- Don't add features beyond what's described
- Don't create a monorepo structure for examples (each is standalone)
