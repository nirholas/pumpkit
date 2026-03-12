# PumpKit Tutorials

Hands-on guides for building PumpFun Telegram bots.

## Bot Building

| # | Tutorial | What You'll Learn |
|---|----------|-------------------|
| 1 | [Telegram Bot Patterns](18-telegram-bot.md) | Interactive DM bot with grammy, commands, price alerts, graduation alerts |
| 2 | [Channel Bot Setup](22-channel-bot-setup.md) | Read-only channel feed, one-way broadcasts, event formatting |
| 3 | [AI-Enriched Channel Bot](39-channel-bot-ai-enrichment.md) | GitHub enrichment, first-claim detection, rich HTML cards |
| 4 | [Trading Bot Architecture](11-trading-bot.md) | Condition-based trading patterns, bot architecture |
| 5 | [Monitoring Website](17-monitoring-website.md) | Next.js dashboard, SDK data layer, API routes, React hooks |

## Monitoring & Events

| # | Tutorial | What You'll Learn |
|---|----------|-------------------|
| 6 | [Monitoring Fee Claims](16-monitoring-claims.md) | Claims architecture, tracking token incentives, creator fees, cashback |
| 7 | [Event Parsing & Analytics](29-event-parsing-analytics.md) | Decoding 20+ on-chain events from Pump/PumpAMM/PumpFees logs |
| 8 | [WebSocket Real-Time Feeds](21-websocket-realtime-feeds.md) | Real-time token launches & trades via WebSocket |

## Getting Started with Bots

| # | Tutorial | What You'll Learn |
|---|----------|-------------------|
| 9 | [Your First Claim Bot](40-your-first-claim-bot.md) | Set up a claim bot from scratch with grammy and Solana RPC |
| 10 | [Customizing Claim Cards](41-customizing-claim-cards.md) | HTML message formatting, badges, enrichment fields |
| 11 | [Channel Feed Bot](42-channel-feed-bot.md) | Read-only channel broadcasting, event filtering, formatting |
| 12 | [Understanding PumpFun Events](43-understanding-pumpfun-events.md) | On-chain event types, log parsing, program account decoding |

## SDK & Architecture

| # | Tutorial | What You'll Learn |
|---|----------|-------------------|
| 13 | [Offline vs Online SDK](12-offline-vs-online.md) | PumpSdk (offline) vs OnlinePumpSdk, hybrid approach, when to use each |
| 14 | [Cross-Program Trading](24-cross-program-trading.md) | Pump→PumpAMM lifecycle, bonding curve vs AMM, unified smartBuy/smartSell |
| 15 | [DeFi Agents Integration](25-defi-agents-integration.md) | 43 AI agent definitions, OpenAI/Claude wiring, multi-agent systems |

## Protocol Knowledge

| # | Tutorial | What You'll Learn |
|---|----------|-------------------|
| 16 | [Fee Sharing Setup](07-fee-sharing.md) | Configuring shareholders, fee distribution mechanics |
| 17 | [Error Handling Patterns](33-error-handling-patterns.md) | Validation patterns for fee sharing, error classes |
| 18 | [Cashback & Social Fees](27-cashback-social-fees.md) | Cashback rewards, social fee PDAs, identity-linked fees |
| 19 | [Analytics & Price Quotes](28-analytics-price-quotes.md) | Quote functions, price impact, graduation progress, price feeds |
| 20 | [AMM Liquidity Operations](34-amm-liquidity-operations.md) | Post-graduation AMM trading, LP tokens, creator fees |
| 21 | [Admin Protocol Management](35-admin-protocol-management.md) | Feature toggles, creator management, fee sharing admin, social fees |

## Vanity Addresses & CLI

| # | Tutorial | What You'll Learn |
|---|----------|-------------------|
| 22 | [Vanity Addresses](13-vanity-addresses.md) | Rust/TS/Shell vanity generators, MCP integration, security |
| 23 | [Batch Shell Scripts](30-batch-shell-scripts.md) | Bash vanity scripts, batch generation, verification, utils.sh |
| 24 | [Rust Vanity Deep Dive](31-rust-vanity-deep-dive.md) | Rayon parallelization, VanityGenerator architecture, benchmarking |

## Advanced Topics

| # | Tutorial | What You'll Learn |
|---|----------|-------------------|
| 25 | [x402 Paywalled APIs](14-x402-paywalled-apis.md) | HTTP 402 protocol, paywalled server, auto-paying client, pricing tiers |
| 26 | [x402 Facilitator Service](36-x402-facilitator-service.md) | Facilitator service, payment verification/settlement, manual payments |
| 27 | [Plugin Delivery](32-plugin-delivery.md) | Plugin marketplace, manifest definition, function handlers, standalone UI |
| 28 | [Plugin Gateway API Handlers](45-plugin-gateway-api-handlers.md) | Gateway API handlers, 17 plugins, edge functions, SDK validation |
| 29 | [Testing & Benchmarking](38-testing-benchmarking.md) | CLI tests, fuzz tests, stress tests, Rust vs TS benchmarks |
| 30 | [Custom DeFi Agents & i18n](44-custom-defi-agents-i18n.md) | AI agent JSON definitions, 18-language translations, LLM integration |

## Prerequisites

- Node.js 20+
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))
- A Solana RPC URL (free or paid provider)
- Basic TypeScript knowledge

## Getting Started

New to PumpKit? Start with:

1. [Getting Started](../docs/getting-started.md) — Setup and first bot
2. [Architecture](../docs/architecture.md) — How PumpKit is structured
3. [Tutorial #1: Telegram Bot Patterns](18-telegram-bot.md) — Build your first bot
