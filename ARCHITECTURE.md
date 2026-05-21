# Architecture

> Deep-dive on how PumpKit is structured. For the high-level intro, see [README.md](README.md). For up-to-the-minute status, see [STATUS.md](STATUS.md).
>
> The doc-site version of this lives at [docs/architecture.md](docs/architecture.md) and stays in sync with this one — edit either side and confirm the other matches.

## Goals + non-goals

**Goals:**

1. Ship production-tested pump.fun monitors and bots as one cohesive framework.
2. Make `@pumpkit/core` a re-usable substrate for third-party bots — typed events, helpers, scaffolding.
3. Keep adoption gradual: a developer can use one package without buying into all of them.
4. Track the pump.fun protocol surface accurately, including V1 and V2 (USDC pair, rolled out 2026-05-21).

**Non-goals:**

1. We are **not** an MEV extraction framework. We surface MEV defensively (see [tutorial 50](tutorials/50-mev-protection-pumpfun.md)).
2. We are **not** a hosted service. PumpKit ships code; you run the infrastructure.
3. We are **not** an exhaustive Solana SDK — `@nirholas/pump-sdk` and `@solana/web3.js` own the lower layers.

## Layered shape

```text
            ┌──────────────────────────────────────────────────────────┐
            │                        Telegram                          │
            │                (grammY, channels, DMs, groups)           │
            └──────────────────┬────────────────────┬──────────────────┘
                               │                    │
                  ┌────────────▼──┐         ┌───────▼─────────┐
                  │  @pumpkit/    │         │  @pumpkit/      │
                  │  monitor      │         │  channel        │
                  │  (DM + REST)  │         │  (broadcast)    │
                  └────────────┬──┘         └───────┬─────────┘
                               │                    │
                  ┌────────────▼────────────────────▼─────────┐
                  │              @pumpkit/core                │
                  │                                            │
                  │  bot/        scaffold (grammY, commands)   │
                  │  monitor/    Launch/Whale/Claim/CTO/...    │
                  │  solana/     RPC, programs, SDK bridge     │
                  │  formatter/  HTML templates for Telegram   │
                  │  storage/    File + SQLite adapters        │
                  │  config/     Typed env loader              │
                  │  health/     HTTP health server            │
                  │  logger/     Leveled console               │
                  │  api/        REST + SSE + webhook server   │
                  │  social/     Twitter/X + GitHub            │
                  │  types/      Shared event types            │
                  └────────────┬────────────────────┬──────────┘
                               │                    │
              ┌────────────────▼──┐      ┌──────────▼──────────┐
              │ @nirholas/        │      │ @solana/web3.js     │
              │ pump-sdk          │      │ + spl-token         │
              │ (V1 + V2 builders │      │                     │
              │  + event decoders)│      │                     │
              └───────────────────┘      └─────────────────────┘
                               │                    │
                               ▼                    ▼
                  ┌─────────────────────────────────────────────┐
                  │              Solana RPC                     │
                  │     (Helius / Triton / QuickNode / public)  │
                  └─────────────────────────────────────────────┘
```

`@pumpkit/web` and `@pumpkit/tracker` sit on the same `core` substrate but aren't shown for clarity.

## Packages

| Package | Role | Key entry points |
|---|---|---|
| [@pumpkit/core](packages/core/) | Shared substrate | `LaunchMonitor`, `WhaleMonitor`, `ClaimMonitor`, `createBot`, `formatClaim`, `SqliteStore`, `createHealthServer` |
| [@pumpkit/monitor](packages/monitor/) | All-in-one DM bot | `/start`, `/help`, REST `/api/*`, SSE `/stream` |
| [@pumpkit/channel](packages/channel/) | Channel broadcast bot | event → formatted HTML → channel post |
| [@pumpkit/claim](packages/claim/) | Fee-claim tracker | ClaimMonitor wired to a dedicated bot |
| [@pumpkit/tracker](packages/tracker/) | Call-tracking + leaderboards | group-chat calls, PnL cards, rankings |
| [@pumpkit/web](packages/web/) | Dashboard | Hero, packages, dashboard, docs, create-demo |

## Cross-cutting concerns

### Events: V1 vs V2

The pump.fun program emits distinct event variants for V1 and V2 instructions. PumpKit handles both:

- **Decoders** come from `@nirholas/pump-sdk` (typed; recent commits moved channel + event-monitor to V2 — `1bfec69`, `54768bc`).
- **Internal normalisation:** every event gets an `isV2` boolean and a `quoteMint` field, even V1 (default WSOL). This keeps downstream code uniform.
- **See:** [tutorial 52 — V1 → V2 migration](tutorials/52-v1-to-v2-migration.md) for how to wire both into the same handler.

### Quote mints

Quote mint matters for V2 calls:

- **USDC pair:** USDC mint (mainnet `EPjFWdd…`, devnet different).
- **SOL pair:** wrapped SOL (`So11111…`) is the quote mint, but trades settle in native SOL.

A trade adapter at [packages/core/src/solana/](packages/core/src/solana/) routes V1 vs V2 by quote mint. See [tutorial 52](tutorials/52-v1-to-v2-migration.md).

### Storage

Two adapters, same interface:

- `FileStore` — JSON on disk; OK for low-volume bots.
- `SqliteStore` — `better-sqlite3`; default for prod; required for tracker leaderboards.

Both are stateless across restarts only if their underlying file is preserved. In containers, mount a volume at the store path.

### Health + observability

Every bot calls `createHealthServer({ port })` which exposes `/healthz`. Add custom probes (RPC reachable, monitor up, last-event-age) via the same module.

For metrics, `LOG_LEVEL=info` is the default; bump to `debug` while tuning. There is no Prometheus exporter in `core` today — see [STATUS.md](STATUS.md) for the open work.

### Configuration

`@pumpkit/core/config` loads typed env vars with validation. Required keys are declared in the bot's startup file; missing or malformed values fail-fast at boot rather than crashing mid-event.

```typescript
import { loadConfig } from '@pumpkit/core';

const cfg = loadConfig({
  TELEGRAM_BOT_TOKEN: { type: 'string', required: true },
  SOLANA_RPC_URL:     { type: 'string', required: true },
  STORE_PATH:         { type: 'string', default: './data/store.sqlite' },
  LOG_LEVEL:          { type: 'enum', values: ['debug', 'info', 'warn', 'error'], default: 'info' },
});
```

### Security boundaries

- **Keypair files** never leave the local filesystem. Mode `600`. Loaded via `Keypair.fromSecretKey(...)` at boot.
- **`.env` files** are gitignored. The repo includes `.env.example` per package with placeholder values.
- **Tools** in `tools/` do not accept secrets via CLI args — they expect files or env vars.
- **CI** never has access to a deployer keypair. Release publishes via `NPM_TOKEN` only.
- See [SECURITY.md](SECURITY.md) for the disclosure policy.

## Build + monorepo

- **Turborepo** drives `build`, `dev`, `lint`, `test`, `typecheck` across workspaces (config in [turbo.json](turbo.json)).
- **Workspaces:** `packages/*` declared in [package.json](package.json).
- **TypeScript:** project-references via [tsconfig.base.json](tsconfig.base.json).
- **Per-package configs:** each package has its own `tsconfig.json`, `package.json`, and `vitest.config.ts`.
- **Output:** each package emits `dist/` (gitignored). Published packages ship only `dist/` and `package.json`.

## Release flow

1. PR is opened with a [changeset](https://github.com/changesets/changesets) describing the change + semver bump.
2. On merge, [.github/workflows/release.yml](.github/workflows/release.yml) opens or updates a "Release PR" that aggregates pending changesets.
3. Merging the Release PR runs `npx changeset publish` to publish to npm.
4. Tags are pushed automatically; release notes are aggregated from changeset summaries.

See [tutorials/52-v1-to-v2-migration.md](tutorials/52-v1-to-v2-migration.md) for an example of how a multi-package additive migration is broken into changesets.

## Why we made these choices

### Turborepo vs Nx vs Yarn workspaces

Turborepo: simple, fast, no opinionated boilerplate. Nx is heavier; we don't need its plugin system. Yarn workspaces alone don't cache cross-task — Turborepo does.

### npm vs pnpm

We use npm because contributors have it by default and `package-lock.json` is universal. pnpm's symlink farms can confuse some tooling. The tradeoff is slightly slower installs.

### grammY vs Telegraf

grammY has better TypeScript types, modern middleware, and active maintenance. Telegraf is fine but less ergonomic at v4.

### File-based + SQLite vs Postgres

For per-user bot state, SQLite is enough. Postgres pulls in operational overhead (separate process, network, backups) without buying us much for the per-bot persistence we need. For analytics indexers, we recommend external Postgres (see [tutorial 49](tutorials/49-indexing-v2-events.md)).

### Why a peer-dependency on `@nirholas/pump-sdk`

The SDK ships typed decoders + instruction builders that pump.fun updates in lock-step with their on-chain program. Keeping it as a peer dep means:

- Consumers can pin the SDK version they tested against.
- We don't ship a version-skewed copy.
- Security advisories on the SDK reach consumers, not us.

## Where things go wrong (and where to look)

| Symptom | First place to look |
|---|---|
| No events arriving | [.claude/agents/rpc-doctor.md](.claude/agents/rpc-doctor.md), [docs/rpc-best-practices.md](docs/rpc-best-practices.md) |
| Tx fails simulation | [tutorials/51-slippage-modeling-v2.md](tutorials/51-slippage-modeling-v2.md), simulate first, read logs |
| Sandwich attacks suspected | [tutorials/50-mev-protection-pumpfun.md](tutorials/50-mev-protection-pumpfun.md) |
| V2 events not decoding | bump `@nirholas/pump-sdk` |
| USDC pair launch fails | [tutorials/46-usdc-pair-launches.md](tutorials/46-usdc-pair-launches.md) |
| Migration plan unclear | [.claude/skills/migrate-v1-to-v2/SKILL.md](.claude/skills/migrate-v1-to-v2/SKILL.md), [tutorials/52-v1-to-v2-migration.md](tutorials/52-v1-to-v2-migration.md) |

## See also

- [README.md](README.md) — what + why
- [docs/architecture.md](docs/architecture.md) — doc-site version of this page (keep in sync)
- [docs/getting-started.md](docs/getting-started.md) — setup
- [STATUS.md](STATUS.md) — current state
- [docs/roadmap.md](docs/roadmap.md) — where we're going
