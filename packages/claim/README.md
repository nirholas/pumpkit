# PumpFun Claim Bot

Interactive Telegram bot that monitors PumpFun fee claims and notifies you instantly. Track tokens by contract address or X accounts by handle — similar to [Bags.fm Fee Tracker](https://bags.fm).

## Features

- **Twitter follower tracking** — See follower counts and influencer follows for tracked X accounts (optional)

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and quick start guide |
| `/add <token CA>` | Track a token by contract address |
| `/add @handle` | Track an X (Twitter) account |
| `/remove <token CA or @handle>` | Stop tracking an item |
| `/list` | View all tracked items |
| `/status` | Monitor status and stats |
| `/help` | Full command list |

## Quick Start

1. Create a bot via [@BotFather](https://t.me/BotFather) on Telegram
2. Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

3. Install dependencies and run:

```bash
npm install
npm run dev
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ | — | Bot token from @BotFather |
| `SOLANA_RPC_URL` | ❌ | `https://api.mainnet-beta.solana.com` | Solana RPC endpoint |
| `SOLANA_WS_URL` | ❌ | Derived from RPC | WebSocket URL for real-time monitoring |
| `SOLANA_RPC_URLS` | ❌ | — | Comma-separated fallback RPCs |
| `POLL_INTERVAL_SECONDS` | ❌ | `15` | Polling interval (when WS unavailable) |
| `LOG_LEVEL` | ❌ | `info` | `debug` \| `info` \| `warn` \| `error` |
| `TWITTER_BEARER_TOKEN` | ❌ | — | Twitter API v2 bearer token for follower tracking |
| `TWITTER_INFLUENCER_IDS` | ❌ | — | Comma-separated list of influencer user IDs to check for follows |

> **Tip:** Use a paid RPC (Helius, QuickNode, Triton) for reliable WebSocket support.

### Twitter Follower Tracking (Optional)

To enable Twitter follower counts and influencer follow tracking:

1. Get a Twitter API v2 bearer token from [Twitter Developer Portal](https://developer.twitter.com/)
2. Set `TWITTER_BEARER_TOKEN` in your `.env` file
3. (Optional) Set `TWITTER_INFLUENCER_IDS` to a comma-separated list of Twitter user IDs to check for follows

When enabled, claim notifications will show:
- **Follower count** for the token creator's X account (formatted as 1.2K, 3.4M, etc.)
- **Influencer follows** if any tracked influencer follows the creator

Example notification with Twitter data:
```
🏦 Creator Fee Claim Detected!

👤 Claimer: abc123...xyz
💰 Amount: 2.5000 SOL
Token: PUMP (PumpToken) · $127.5K mcap
🐦 X Account: @creator · 12.3K followers · ⭐ Followed by 2 tracked influencer(s)
⚙️ Program: Pump
```

## How It Works

1. **On-chain monitoring** — Watches Pump (`6EF8r...`), PumpSwap AMM (`pAMMB...`), and PumpFees (`pfeeU...`) programs for fee claim transactions
2. **Instruction matching** — Detects `collect_creator_fee`, `claim_cashback`, `distribute_creator_fees`, `collect_coin_creator_fee`, and `claim_social_fee_pda` instructions
3. **Token matching** — When a claim is detected, checks if the token mint matches any tracked tokens
4. **X handle matching** — Fetches token metadata from PumpFun API to resolve the creator's X handle, then matches against tracked handles
5. **Twitter enrichment** (optional) — Fetches follower counts and checks influencer follows for tracked X accounts
6. **Notification** — Sends rich HTML notifications to all matching chats with links to Solscan and pump.fun

## Deployment

### Docker

```bash
docker build -t pumpfun-claim-bot .
docker run --env-file .env pumpfun-claim-bot
```

### Railway

Click "Deploy" in the Railway dashboard — `railway.json` is pre-configured.

## Architecture

```
claim-bot/
├── src/
│   ├── index.ts          # Entry point — wires config → monitor → bot
│   ├── config.ts         # Environment variable loader
│   ├── bot.ts            # Telegram commands (/add, /remove, /list, /status)
│   ├── monitor.ts        # Solana on-chain claim monitor (WS + polling)
│   ├── store.ts          # Persistent tracking store (tokens + X handles)
│   ├── pump-client.ts    # PumpFun API client for token enrichment
│   ├── twitter-client.ts # Twitter/X API client for follower tracking
│   ├── formatters.ts     # HTML message formatters
│   ├── logger.ts         # Structured logger
│   └── types.ts          # Type definitions & program constants
├── package.json
├── tsconfig.json
├── Dockerfile
├── railway.json
└── .env.example
```

## Monitored Claim Types

| Claim Type | Program | Description |
|-----------|---------|-------------|
| `collect_creator_fee` | Pump | Creator collects fees from bonding curve |
| `claim_cashback` | Pump / PumpSwap | User claims cashback rewards |
| `distribute_creator_fees` | Pump | Fee distribution to shareholders |
| `collect_coin_creator_fee` | PumpSwap | Creator collects fees from AMM pool |
| `transfer_creator_fees_to_pump` | PumpSwap | Transfer AMM fees to Pump program |
| `claim_social_fee_pda` | PumpFees | Social fee PDA claim |
