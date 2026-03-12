# Outsiders Bot

Telegram call-tracking bot with leaderboards, PNL cards, and performance analytics. Track crypto calls, rank callers by win rate, and compete on leaderboards.

## Features

- **Call Tracking** — Paste a token CA, LP link, or chart URL → bot registers the call and tracks performance
- **Auto Calls / Button Mode** — Auto-register after 30s, or manual confirm with alpha/gamble selection
- **Leaderboards** — Top calls by multiplier, performance rankings by points (24h / 7d / 30d / all)
- **Points System** — -1 (< 1.5x) → 0 (1.5-2x) → +2 (2-5x) → +3 (5-15x) → +4 (15-30x) → +5 (30x+)
- **Win Rate** — Percentage of calls hitting ≥ 2x
- **Ranks** — Amateur → Novice → Contender → Guru → Oracle (based on win rate)
- **PNL Cards** — Shareable images showing entry, ATH, gain
- **Hardcore Mode** — Auto-kick members below minimum win rate
- **Call Channels** — Forward calls to a dedicated channel
- **Block/Unblock** — Admins can block users from making calls
- **Multi-chain** — Solana, Ethereum, Base, BSC

## Quick Start

```bash
cd outsiders-bot
npm install
cp .env.example .env
# Edit .env with your TELEGRAM_BOT_TOKEN
npm run dev
```

## Commands

### Group Commands

| Command | Description |
|---------|-------------|
| `/leaderboard` | Show Calls or Performance leaderboard |
| `/last <N>` | Show last N calls |
| `/calls @user` | Show user's calls |
| `/winrate @user` | Show user's win rate and stats |
| `/pnl <CA>` | Generate PNL card for a token |
| `/alpha <CA>` | Make an alpha call |
| `/gamble <CA>` | Make a gamble call |
| `/hardcore` | Show hardcore mode status |

### Admin Commands

| Command | Description |
|---------|-------------|
| `/settings` | Configure call mode, display mode, hardcore |
| `/wipeleaderboard` | Clear all calls and reset leaderboard |
| `/block` | Reply to block a user from making calls |
| `/unblock` | Reply to unblock a user |

### DM Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/rank` | Your overall rank card across all groups |
| `/help` | List all commands |

## Architecture

```
outsiders-bot/
├── src/
│   ├── index.ts          # Entry point — wires config, DB, bot, ATH tracker
│   ├── config.ts         # Environment config loader
│   ├── types.ts          # Type definitions, scoring, rank calculation
│   ├── db.ts             # SQLite database (better-sqlite3)
│   ├── bot.ts            # grammy bot — commands and handlers
│   ├── token-service.ts  # DexScreener API — token price/mcap
│   ├── ath-tracker.ts    # Polls active calls to update ATH
│   ├── formatters.ts     # HTML message formatting
│   ├── pnl-card.ts       # Canvas-based PNL image generator
│   └── logger.ts         # Leveled logger
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## How It Works

1. User pastes a contract address or chart link in group chat
2. Bot detects it and either auto-registers (30s delay with cancel button) or prompts for alpha/gamble selection
3. Bot fetches current market cap from DexScreener and records the call
4. ATH tracker polls active calls every 60s to update the highest market cap seen
5. Points are calculated based on the multiplier (ATH mcap / entry mcap)
6. Leaderboards aggregate points and win rates across configurable timeframes

## Token Sources

Supports contract addresses and chart URLs from:
- DexScreener
- Birdeye
- Solscan
- Etherscan / Basescan / BscScan
- Raw Solana (base58) and EVM (0x) addresses

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | — | Bot token from @BotFather |
| `CALL_CHANNEL_ID` | No | — | Channel ID for call forwarding |
| `DEXSCREENER_API` | No | `https://api.dexscreener.com` | API base URL |
| `ATH_POLL_INTERVAL` | No | `60` | Seconds between ATH polls |
| `LOG_LEVEL` | No | `info` | debug / info / warn / error |
| `DB_PATH` | No | `./outsiders.db` | SQLite database path |
