# PumpKit Architecture

> System design, module boundaries, and data flow for the PumpKit framework.

## Overview

PumpKit is an npm-workspaces monorepo, orchestrated by Turborepo:

```
pumpkit/
├── packages/
│   ├── core/              @pumpkit/core — shared framework (library)
│   ├── monitor/           @pumpkit/monitor — DM bot + REST API + SSE (app, private)
│   ├── channel/           @pumpkit/channel — read-only channel feed (app)
│   ├── claim/             @pumpkit/claim — fee claim tracker (app)
│   ├── tracker/           @pumpkit/tracker — group call tracker (app)
│   └── web/               @pumpkit/web — dashboard and docs site (private)
├── examples/claim-alert/  minimal bot built on @pumpkit/core
├── docs/                  documentation
└── turbo.json             monorepo config
```

## Package Dependencies

```
@pumpkit/monitor ──→ @pumpkit/core   (logger, escapeHtml, fetchPublic)
examples/claim-alert ──→ @pumpkit/core
```

`@pumpkit/channel`, `@pumpkit/claim` and `@pumpkit/tracker` predate core and
still carry their own logger, config and Pump client code. Moving them onto
core is tracked in [ROADMAP.md](../ROADMAP.md). Core has no internal
dependencies; its heavier dependencies (`grammy`, `@solana/web3.js`,
`better-sqlite3`, the Pump SDKs) are optional peers.

## @pumpkit/core — Module Map

```
packages/core/src/
├── index.ts                  Barrel export (loads every module)
├── bot/index.ts              createBot, broadcast (grammy)
├── monitor/
│   ├── BaseMonitor.ts        status() and prefixed logging
│   ├── LogsMonitor.ts        logsSubscribe per program, signature de-dup, callback isolation
│   ├── ClaimMonitor.ts       creator fee, PumpSwap creator fee, cashback, social fee claims
│   ├── LaunchMonitor.ts      CreateEvent
│   ├── GraduationMonitor.ts  CompleteEvent + CompletePumpAmmMigrationEvent
│   ├── WhaleMonitor.ts       TradeEvent above a SOL threshold
│   ├── CTOMonitor.ts         SetCreator / AdminCto / MigrateBondingCurveCreator events
│   └── FeeDistMonitor.ts     DistributeCreatorFeesEvent
├── solana/
│   ├── programs.ts           Program IDs, discriminators, error codes
│   ├── events.ts             Dependency-free event decoders + log parser
│   ├── rpc.ts                createRpcConnection, RpcFallback, deriveWsUrl
│   ├── sdk-bridge.ts         Quotes and sweeps via the Pump SDKs
│   └── funding-source.ts     detectSeededByPump
├── formatter/
│   ├── links.ts              Escaping link/text helpers, amount formatting
│   └── templates.ts          Notification templates
├── net/http.ts               fetchPublic: SSRF-safe fetch for untrusted URLs
├── storage/                  FileStore (JSON), SqliteStore (better-sqlite3)
├── util/                     retry/backoff, BoundedSet
├── config.ts                 requireEnv, optionalEnv, parseIntEnv, parseListEnv
├── health.ts                 GET /health server
├── shutdown.ts               onShutdown, installShutdownHandlers
├── logger.ts                 Leveled logger
└── types/                    Event and config types
```

## Data Flow

### Monitor Bot — Event Detection Pipeline

```
Solana Mainnet
     │
     ├── WebSocket (onLogs)    ← Real-time event stream
     │        │
     │        ▼
     │   EventMonitor
     │   ├── decode program logs
     │   ├── match instruction discriminators
     │   └── emit typed events
     │
     ├── HTTP Polling           ← Fallback / batch queries
     │        │
     │        ▼
     │   ClaimMonitor / LaunchMonitor / etc.
     │   ├── getSignaturesForAddress
     │   ├── getParsedTransaction
     │   └── deduplicate (claim tracker)
     │
     ▼
Event Bus
     │
     ├──→ Telegram (grammy)
     │    ├── DM notifications (watched wallets)
     │    ├── Group messages
     │    └── Channel broadcasts
     │
     ├──→ REST API
     │    ├── GET /claims, /launches, /status
     │    └── SSE /stream
     │
     └──→ Webhooks
          └── POST to registered URLs
```

### Tracker Bot — Call Tracking Pipeline

```
Telegram Group Chat
     │
     ├── User pastes CA / LP link / chart URL
     │        │
     │        ▼
     │   CallParser
     │   ├── Extract contract address
     │   ├── Detect chain (Sol/Eth/Base/BSC)
     │   └── Validate token exists
     │
     ├── DexScreener API
     │        │
     │        ▼
     │   TokenService
     │   ├── Get current price + mcap
     │   ├── Track ATH (poll every 60s)
     │   └── Calculate multiplier
     │
     ▼
SQLite Database
     │
     ├── calls table (token, user, group, entry price, ATH)
     ├── users table (points, win rate, rank)
     └── groups table (settings, hardcore mode)
     │
     ▼
Telegram Responses
     ├── /leaderboard — Top calls + performance rankings
     ├── /pnl — Canvas-rendered PNL card image
     ├── /rank — User rank + stats
     └── /calls — Call history
```

## Bot Interaction Models

### Model 1: Interactive DM (Monitor Bot)

```
User ──/watch 0x... ──→ Bot
User ←── "Watching wallet 0x..." ──── Bot
         ... time passes ...
User ←── "🔔 Fee Claimed! 2.5 SOL" ── Bot (triggered by on-chain event)
```

### Model 2: Channel Broadcast (Monitor Bot)

```
                    ┌── Channel (read-only)
On-chain event ──→ Bot ──→ "🚀 New Token: $PUMP"
                         "🎓 Graduated: $MOON"
                         "🐋 Whale Buy: 500 SOL"
```

### Model 3: Group Tracker (Tracker Bot)

```
Group Member ── pastes CA ──→ Bot
Bot ──→ "📞 Call registered! Tracking..."
         ... time passes ... (ATH tracker polls)
Group Member ── /leaderboard ──→ Bot
Bot ──→ "🏆 Top Calls (7d):
         1. @alice — 15.2x $PUMP
         2. @bob — 8.7x $MOON"
```

## Solana Program Integration

PumpKit monitors 3 on-chain programs:

| Program | ID | Events Monitored |
|---------|-----|-------------------|
| **Pump** | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` | Create, Buy, Sell, Complete (graduation) |
| **PumpAMM** | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` | Swap, CreatePool, Deposit, Withdraw |
| **PumpFees** | `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ` | ClaimFees, DistributeFees |

### Event Detection Method

```typescript
// WebSocket — subscribe to program logs
connection.onLogs(PUMP_PROGRAM_ID, ({ logs }) => {
  const events = parsePumpLogEvents(logs);
  events.forEach(event => eventBus.emit(event.type, event));
});

// HTTP Polling — fallback for missed events
const sigs = await connection.getSignaturesForAddress(PUMP_PROGRAM_ID, { limit: 50 });
for (const sig of sigs) {
  const tx = await connection.getParsedTransaction(sig.signature);
  const events = parsePumpLogEvents(tx?.meta?.logMessages ?? []);
  // ... deduplicate and process
}
```

## Storage Architecture

### File-Based (Monitor Bot)

Simple JSON persistence for watch lists and settings. Survives restarts, no dependencies.

```
data/
├── watches.json       [{ wallet, chatId, addedAt }]
├── launches.json      [{ mint, name, symbol, detectedAt }]
└── claims.json        [{ signature, processed: true }]
```

### SQLite (Tracker Bot)

Relational storage for leaderboards, call history, group settings.

```sql
-- Core tables
CREATE TABLE users (id, telegram_id, username, points, win_rate, rank);
CREATE TABLE groups (id, telegram_id, name, settings_json, hardcore_mode);
CREATE TABLE calls (id, user_id, group_id, token_ca, chain, entry_price, ath_price, multiplier, created_at);
```

## Deployment Architecture

```
┌──────────── Railway ─────────────┐
│                                   │
│  ┌─────────────┐  ┌───────────┐  │
│  │ Monitor Bot  │  │ Tracker   │  │
│  │ (Node.js)   │  │ Bot       │  │
│  │             │  │ (Node.js) │  │
│  │ Port 3000   │  │ Port 3001 │  │
│  │ /health     │  │ /health   │  │
│  └──────┬──────┘  └─────┬─────┘  │
│         │               │         │
│    data/ (volume)  data/ (volume) │
│    watches.json    bot.sqlite     │
└──────────────────────────────────┘
         │                │
         └───── Telegram API ─────→ Users
         │
    ┌────▼─────┐
    │  Solana   │
    │  Mainnet  │
    │  (RPC)    │
    └──────────┘

┌──────── Vercel ────────┐
│  docs.pumpkit.dev      │
│  (VitePress / Starlight)│
└────────────────────────┘
```

## Configuration Model

Every PumpKit bot is configured via environment variables with typed defaults:

```bash
# Required
TELEGRAM_BOT_TOKEN=        # BotFather token
SOLANA_RPC_URL=            # Helius, QuickNode, etc.

# Optional — feature toggles
FEED_CLAIMS=true           # Enable/disable claim monitoring
FEED_LAUNCHES=true         # Enable/disable launch detection
FEED_GRADUATIONS=true      # Enable/disable graduation alerts
FEED_WHALES=true           # Enable/disable whale trade alerts
WHALE_THRESHOLD_SOL=100    # Minimum SOL for whale alert

# Optional — channel mode
CHANNEL_ID=                # Telegram channel ID for broadcast mode
BROADCAST_ONLY=false       # Disable DM commands, channel-only

# Optional — API
API_ENABLED=false          # Enable REST API
API_PORT=3000              # API server port
API_AUTH_TOKEN=            # Bearer token for API auth

# Optional — social integrations
TWITTER_BEARER_TOKEN=      # Twitter/X API v2 token
GITHUB_TOKEN=              # GitHub API token (social fees)
GROQ_API_KEY=              # Groq LLM for summaries (optional)
```

## Error Handling Strategy

```
Bot Error        → grammy error boundary → log + notify admin
RPC Error        → retry with backoff → rotate to fallback RPC
WebSocket Drop   → auto-reconnect with exponential backoff
Storage Error    → log + continue (non-fatal for monitors)
Telegram Error   → grammy retry middleware → rate limit backoff
```

## Security Boundaries

- No private keys handled by bots — read-only monitoring
- Telegram bot tokens stored in .env, never committed
- RPC URLs treated as secrets (rate-limited endpoints)
- API auth via Bearer token (optional, for REST endpoints)
- Rate limiting on both Telegram commands and API endpoints
- SQLite WAL mode for concurrent reads (tracker bot)
