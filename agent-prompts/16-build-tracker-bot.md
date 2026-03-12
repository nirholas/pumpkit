# Agent Task 16: Build Tracker Bot (from outsiders-bot)

## Context

We're building **PumpKit** (`/workspaces/pump-fun-sdk/pumpkit/`). Read `pumpkit/docs/tracker-bot.md` for the full spec.

The Tracker Bot is adapted from the outsiders-bot. It's the group call-tracking bot.

## Source Files to Read

Read ALL source files:
- `/workspaces/pump-fun-sdk/outsiders-bot/src/index.ts`
- `/workspaces/pump-fun-sdk/outsiders-bot/src/bot.ts`
- `/workspaces/pump-fun-sdk/outsiders-bot/src/config.ts`
- `/workspaces/pump-fun-sdk/outsiders-bot/src/types.ts`
- `/workspaces/pump-fun-sdk/outsiders-bot/src/db.ts`
- `/workspaces/pump-fun-sdk/outsiders-bot/src/token-service.ts`
- `/workspaces/pump-fun-sdk/outsiders-bot/src/ath-tracker.ts`
- `/workspaces/pump-fun-sdk/outsiders-bot/src/pnl-card.ts`
- `/workspaces/pump-fun-sdk/outsiders-bot/src/formatters.ts`
- `/workspaces/pump-fun-sdk/outsiders-bot/src/health.ts`
- `/workspaces/pump-fun-sdk/outsiders-bot/src/logger.ts`

## Task

Create the tracker bot under `/workspaces/pump-fun-sdk/pumpkit/packages/tracker/src/`:

### 1. `index.ts` — Entry point
Adapted from outsiders-bot index.ts, but using @pumpkit/core for:
- Logger → `@pumpkit/core` log
- Health → `@pumpkit/core` createHealthServer
- Config → `@pumpkit/core` loadConfig

### 2. `bot.ts` — Command handlers
Copy and adapt from outsiders-bot/bot.ts. All commands:
- `/leaderboard`, `/last`, `/calls`, `/pnl`, `/rank`
- `/alpha`, `/gamble`
- `/settings`, `/block`, `/unblock`
- Auto call detection (paste CA → register)

### 3. `config.ts` — Config using @pumpkit/core loadConfig

### 4. `types.ts` — Call types, rank system, points
Copy from outsiders-bot/types.ts

### 5. `db.ts` — SQLite database
Adapt from outsiders-bot/db.ts, using @pumpkit/core SqliteStore as the base connection

### 6. `token-service.ts` — DexScreener API client
Copy from outsiders-bot/token-service.ts

### 7. `ath-tracker.ts` — ATH polling
Copy from outsiders-bot/ath-tracker.ts

### 8. `pnl-card.ts` — Canvas PNL card generator
Copy from outsiders-bot/pnl-card.ts

### 9. `formatters.ts` — Leaderboard/stats formatting
Adapt from outsiders-bot/formatters.ts, using @pumpkit/core link helpers

### 10. `.env.example` — Example config

## Requirements

- Replace logger.ts and health.ts with @pumpkit/core imports
- Replace config pattern with @pumpkit/core loadConfig
- Use @pumpkit/core link/formatting helpers where applicable
- Keep specialized code (db.ts, pnl-card.ts, token-service.ts) in the tracker package
- ES module syntax

## Do NOT

- Don't modify outsiders-bot/ source code
- Don't move specialized logic to @pumpkit/core (SQLite queries, canvas rendering, etc.)
