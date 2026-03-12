# Agent Task 15: Consolidate Monitor Bot — Entry Point + Bot Setup

## Context

We're building **PumpKit** (`/workspaces/pump-fun-sdk/pumpkit/`). Read `pumpkit/docs/monitor-bot.md` for the full spec.

The Monitor Bot consolidates telegram-bot + channel-bot + claim-bot into one bot. This task creates the entry point and bot command handlers.

## Source Files to Read

- `/workspaces/pump-fun-sdk/telegram-bot/src/index.ts` — Entry point
- `/workspaces/pump-fun-sdk/telegram-bot/src/bot.ts` — Command handlers
- `/workspaces/pump-fun-sdk/channel-bot/src/index.ts` — Entry point (channel mode)
- `/workspaces/pump-fun-sdk/claim-bot/src/index.ts` — Entry point
- `/workspaces/pump-fun-sdk/claim-bot/src/bot.ts` — Commands (/add, /remove)
- Read the monitor-bot.md spec for the full command list

## Task

Create these files under `/workspaces/pump-fun-sdk/pumpkit/packages/monitor/src/`:

### 1. `index.ts` — Entry point
- Load config
- Initialize monitors based on feed toggles
- Set up bot (or channel-only mode based on BROADCAST_ONLY)
- Optionally start API server
- Wire monitors to bot/channel notifications
- Graceful shutdown

### 2. `bot.ts` — Command handlers
All commands from the merged bots:
- `/start` — Welcome message
- `/help` — Full command list
- `/watch <wallet>` — Track wallet for claims
- `/unwatch <wallet>` — Stop tracking
- `/add <CA or @handle>` — Track token or X account (from claim-bot)
- `/remove <CA or @handle>` — Stop tracking
- `/list` — Show all tracked items
- `/status` — Monitor stats
- `/price <CA>` — Token price
- `/alerts [on/off]` — Toggle alert types

### 3. `config.ts` — Monitor-specific config
Use `@pumpkit/core` loadConfig with the full monitor schema (all env vars from monitor-bot.md spec).

### 4. `.env.example` — Example configuration file
All env vars with comments.

## Requirements

- Import everything possible from `@pumpkit/core` (bot, monitors, formatters, storage, logger, health, config)
- ES module syntax
- Support all 3 modes: DM interactive, channel broadcast, group chat
- Use the `BROADCAST_ONLY` + `CHANNEL_ID` env vars to switch modes
- Keep bot-specific code minimal — lean on core for shared logic

## Do NOT

- Don't recreate code that belongs in @pumpkit/core
- Don't modify existing bot code in telegram-bot/, channel-bot/, claim-bot/
