# `@pumpkit/example-claim-alert`

A minimal end-to-end Telegram bot that uses `@pumpkit/core` to broadcast
PumpFun fee-claim events. Designed as a 100-line reference — copy it,
strip the parts you don't need, and ship.

## What it demonstrates

| Primitive                  | Where it's used                                            |
| -------------------------- | ---------------------------------------------------------- |
| `createBot`                | grammy scaffold with `/start`, `/help`, `/watch`, `/list`  |
| `ClaimMonitor`             | Decodes Pump, PumpSwap and PumpFees fee-claim events       |
| `FileStore`                | JSON-backed persistence of watched wallets                 |
| `createRpcConnection`      | RPC client with automatic failover between endpoints       |
| `retry`                    | Webhook delivery with exponential backoff + jitter         |
| `formatClaim`              | HTML message builder for Telegram `parse_mode: 'HTML'`    |
| `installShutdownHandlers`  | SIGINT/SIGTERM teardown: stops the monitor and the bot     |

## Setup

```bash
cp examples/claim-alert/.env.example examples/claim-alert/.env
# Fill in BOT_TOKEN, SOLANA_RPC_URL, and CHAT_ID
```

From the repo root:

```bash
npm install
npm run dev --workspace=@pumpkit/example-claim-alert
```

You should see:

```
[INFO] Claim alert bot online — watching 0 wallet(s)
```

DM the bot `/start` in Telegram, then `/watch <wallet>` with a creator or
claimer address. Claims received by that wallet are posted to `CHAT_ID`.

Creator fees accrue in a vault per creator, not per coin, so on-chain claim
events name the wallet that received the funds but not a mint. That is why
this example watches wallets.

## Commands

| Command              | Effect                                          |
| -------------------- | ----------------------------------------------- |
| `/start`             | Welcome message + brief usage                   |
| `/help`              | Command reference                               |
| `/watch <wallet>`    | Add a wallet to the watchlist                   |
| `/unwatch <wallet>`  | Remove a wallet                                 |
| `/list`              | Show all currently watched wallets              |

If the watchlist is empty, the bot broadcasts **every** claim event. As soon
as you `/watch` at least one wallet, it filters to the watchlist.

## Webhook mode

If `WEBHOOK_URL` is set, every claim event is also POSTed there as JSON:

```json
{
  "type": "claim",
  "event": { /* ClaimEvent fields — see @pumpkit/core types/events */ }
}
```

`event.amount` is a decimal string of base units (lamports for SOL), since
JSON has no 64-bit integer type.

Delivery is retried up to 4 times with exponential backoff (500ms → 1s →
2s → 4s, ±50% jitter). Retries happen on:

- HTTP `429` (rate limited)
- HTTP `502 / 503 / 504` (transient server errors)
- Network errors (`ETIMEDOUT`, `ECONNRESET`, `fetch failed`)

Auth errors (`401`, `403`) fail fast — they won't get better on retry.

## File layout

```
examples/claim-alert/
├── .env.example       — config template (copy to .env)
├── README.md          — this file
├── package.json       — workspace package definition
├── tsconfig.json      — extends repo tsconfig.base.json
└── src/
    └── index.ts       — the entire bot (~100 lines)
```

The bot writes its watchlist state to `./data/watched.json` by default
(configurable via `STORE_PATH`). `./data/` is already gitignored at the
repo root, so the file won't accidentally land in commits.

## Adapting this example

A few common reshapes:

- **Different event type** — swap `ClaimMonitor` for `LaunchMonitor`
  (`onLaunch`), `GraduationMonitor` (`onGraduation`), `WhaleMonitor`
  (`onWhaleTrade`), `CTOMonitor` (`onCTO`) or `FeeDistMonitor` (`onFeeDist`).
- **Multiple chats** — replace `CHAT_ID` with a `Set<string>` and
  broadcast to each.
- **Channel mode** — add the bot as a channel administrator and set
  `CHAT_ID` to the channel's `@username` or numeric ID.
- **SQLite persistence** — `SqliteStore` is a thin `better-sqlite3` wrapper
  (`exec`, typed queries) for when you need SQL over stored claims instead of
  one JSON document.

For a fuller example covering all monitor types, see [`@pumpkit/monitor`](../../packages/monitor/).
