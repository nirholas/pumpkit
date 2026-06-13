# ADR 0002 — Turborepo monorepo with workspace packages

- **Status**: Accepted
- **Date**: 2026-05-21 (recording an earlier decision)
- **Drivers**: founding maintainers

## Context

PumpKit started as a single `claim-bot` repo. As the surface grew — DM bot, channel bot, claim tracker, dashboard, shared SDK bridge — it became clear that several packages were emerging:

- A **core** library with shared infrastructure (logger, config, health, monitor, SDK bridge)
- A **monitor** service exposing REST + SSE
- A **channel** bot for one-way broadcast
- A **claim** tracker for fee claims
- A **tracker** leaderboard bot
- A **web** dashboard

Each had its own dependencies, its own deployment target (Docker, Vercel, npm package), and its own release cadence. Three forces shaped the decision:

1. **Code reuse.** Logger, formatter, RPC resolver, and event decoders were copy-pasted across early bot repos. That broke daily.
2. **Release independence.** The dashboard ships when the dashboard ships; the monitor ships when the monitor ships. Coupling them in one package would force tandem releases.
3. **Type safety across boundaries.** With a monorepo we get TypeScript project references and end-to-end type checking across packages without publishing intermediate releases.

## Decision

PumpKit is a **Turborepo monorepo** using **npm workspaces**. Packages live under `packages/` and publish to npm under the `@pumpkit/*` scope.

| Package | Role |
|---|---|
| `@pumpkit/core` | Shared framework: logger, config, health, bot scaffold, formatter, monitors, storage, SDK bridge |
| `@pumpkit/monitor` | DM bot + REST API + SSE stream |
| `@pumpkit/channel` | Channel broadcast bot |
| `@pumpkit/claim` | Fee-claim tracker |
| `@pumpkit/tracker` | Call-tracking leaderboard bot |
| `@pumpkit/web` | Dashboard UI with live SSE feed |

Workflow conventions:

- `npm install` at the root bootstraps all workspaces.
- `turbo run build|test|typecheck|lint` runs the task across packages with caching and dependency awareness.
- `npm run dev --workspace=@pumpkit/monitor` runs a single package in watch mode.
- A `Makefile` at the root provides shortcuts for common flows (`make dev-monitor`, `make docker-tracker`).
- Node ≥ 20 is the minimum.

## Consequences

**Positive:**

- Shared code lives in `@pumpkit/core` and changes flow to consumers immediately, with type safety.
- Each package versions and releases independently.
- One install, one lockfile, one CI matrix.
- Turborepo's task cache makes incremental builds fast even as the repo grows.

**Negative:**

- Monorepos require explicit ownership and conventions. Without them, packages drift into mutual dependencies that defeat the layout.
- New contributors face a learning curve before they understand which package owns what.
- `node_modules` resolution gets confusing when peer-dep ranges drift between packages.
- Some tooling (older bundlers, certain Docker layouts) doesn't understand workspace symlinks.

**Future obligations:**

- Keep `@pumpkit/core` minimal. It is the bedrock; adding a feature there means everything depends on it.
- Maintain consistent TypeScript and ESLint config at the root. Per-package overrides should be the exception.
- Document new packages in the table above (CLAUDE.md mirrors this table — keep them in sync).

## Considered alternatives

### A. Multi-repo with shared library

Each bot in its own repo, with `@pumpkit/core` published to npm and consumed normally.

**Rejected.** Coordinating breaking changes across repos is high-friction. The shared library would always either drag the consumers or be held back by them. Monorepo gives us atomic cross-package changes.

### B. Single package with subpath exports

Ship everything as one `pumpkit` package with subpath exports (`pumpkit/monitor`, `pumpkit/channel`).

**Rejected.** Forces tandem releases. A breaking change to the dashboard would force a major version bump for users who only consume the SDK bridge.

### C. Nx instead of Turborepo

Considered briefly. Both are capable. We picked Turborepo for its simpler config and the team's existing familiarity. Migration to Nx is possible if Turborepo proves insufficient.

**Deferred.** Revisit if Turborepo's caching or task graph become a bottleneck.

## See also

- [docs/architecture.md](../architecture.md)
- [package.json](../../package.json) — workspace config
- [turbo.json](../../turbo.json) — task graph
- [CLAUDE.md](../../CLAUDE.md) — package table
