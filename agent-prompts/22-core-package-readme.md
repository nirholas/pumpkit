# Agent Task 22: Write Comprehensive README for @pumpkit/core

## Context

We're building **PumpKit** (`/workspaces/pump-fun-sdk/pumpkit/`). Read the existing docs:
- `pumpkit/README.md` — Project overview
- `pumpkit/docs/core-api.md` — API reference
- `pumpkit/docs/architecture.md` — System design

## Task

Create `/workspaces/pump-fun-sdk/pumpkit/packages/core/README.md`:

This is the README that will appear on npm for `@pumpkit/core`. It should be polished, complete, and make developers want to use the framework.

### Sections to include:

1. **Header** — Package name, one-line description, badges (npm version, license, Node.js version)

2. **What is PumpKit Core?** — 2-3 sentences. It's the shared framework for building PumpFun Telegram bots.

3. **Installation** — `npm install @pumpkit/core`

4. **Quick Start** — 30-line example: create a bot that monitors fee claims

5. **Modules** — Brief description of each module with code snippet:
   - `bot/` — Telegram bot scaffolding
   - `monitor/` — Event monitors (Claim, Launch, Graduation, Whale, CTO, FeeDist)
   - `solana/` — RPC connection, program IDs, decoders
   - `formatter/` — Telegram HTML message templates
   - `storage/` — FileStore + SqliteStore
   - `config/` — Typed env config loader
   - `health/` — Health check server
   - `logger/` — Leveled logger
   - `api/` — REST + SSE + webhooks
   - `social/` — Twitter/X + GitHub

6. **Monitors** — Table of all 6 monitors with what they detect

7. **Configuration** — Show the config schema pattern

8. **Built With** — Tech stack list (grammy, @solana/web3.js, better-sqlite3, etc.)

9. **Pre-Built Bots** — Links to @pumpkit/monitor and @pumpkit/tracker

10. **Contributing** — Link to CONTRIBUTING.md

11. **License** — MIT

## Requirements

- Professional quality — this is the public face of the framework on npm
- Include real code examples (not pseudocode)
- Use npm badges (version, license, downloads)
- Keep it scannable — use tables, headers, code blocks
- Link to full docs site

## Do NOT

- Don't write API documentation (that's docs/core-api.md)
- Don't duplicate the full API reference — link to it instead
