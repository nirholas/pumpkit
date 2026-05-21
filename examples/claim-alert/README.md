# `@pumpkit/example-claim-alert`

A minimal end-to-end Telegram bot that uses `@pumpkit/core` to broadcast
PumpFun fee-claim events. Designed as a 100-line reference — copy it,
strip the parts you don't need, and ship.

## What it demonstrates

| Primitive                  | Where it's used                                            |
| -------------------------- | ---------------------------------------------------------- |
| `createBot`                | grammy scaffold with `/start`, `/help`, `/watch`, `/list`  |
| `ClaimMonitor`             | Subscribes to PumpFun fee-claim events                     |
| `FileStore`                | JSON-backed persistence of watched mints                   |
| `createRpcConnection`      | RPC client with automatic failover between endpoints       |
| `retry` + `isTransientError` | Webhook delivery with exponential backoff + jitter        |
| `formatClaim`              | HTML message builder for Telegram `parse_mode: 'HTML'`    |
| `installShutdownHandlers`  | Clean SIGINT/SIGTERM teardown — flushes the store + bot   |

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
[INFO] Claim alert bot online — watching 0 token(s)
```

DM the bot `/start` in Telegram, then `/watch <mint>` with a token address.
Claim events for that mint will be posted to `CHAT_ID`.

## Commands

| Command              | Effect                                          |
| -------------------- | ----------------------------------------------- |
| `/start`             | Welcome message + brief usage                   |
| `/help`              | Command reference                               |
| `/watch <mint>`      | Add a mint to the watchlist                     |
| `/unwatch <mint>`    | Remove a mint                                   |
| `/list`              | Show all currently watched mints                |

If the watchlist is empty, the bot broadcasts **every** claim event. As soon
as you `/watch` at least one mint, it filters to the watchlist.

## Webhook mode

If `WEBHOOK_URL` is set, every claim event is also POSTed there as JSON:

```json
{
  "type": "claim",
  "event": { /* ClaimEvent fields — see @pumpkit/core types/events */ }
}
```

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

- **Different event type** — swap `ClaimMonitor` for `LaunchMonitor`,
  `GraduationMonitor`, `WhaleMonitor`, `CTOMonitor`, or `FeeDistMonitor`.
  Same callback shape, just a different event type.
- **Multiple chats** — replace `CHAT_ID` with a `Set<string>` and
  broadcast to each.
- **Channel mode** — add the bot as a channel administrator and set
  `CHAT_ID` to the channel's `@username` or numeric ID.
- **SQLite persistence** — swap `FileStore` for `SqliteStore` if you
  need queries (e.g. "show me all claims for mint X in the last hour").
- **Programmatic API** — drop the Telegram parts and instead expose an
  HTTP/SSE endpoint via `@pumpkit/core`'s `createHealthServer` + your
  own router.

For a fuller example covering all monitor types, see [`@pumpkit/monitor`](../../packages/monitor/).
