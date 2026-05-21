# PumpKit Roadmap

This is the public, intentionally-incomplete roadmap. Anything below "Now" is directional and may change as protocol shifts or community priorities update. If you'd like to influence the order, open a discussion (see [.github/DISCUSSION_TEMPLATE](./.github/DISCUSSION_TEMPLATE/)) or comment on an existing issue.

For *current* state and architecture, see [docs/architecture.md](docs/architecture.md). For *historical* decisions, see [docs/adr/](docs/adr/).

## Now (in progress)

### V2 / USDC pair support across all packages

- [x] V2 event decoders in `@nirholas/pump-sdk` peer-dep (`refactor(channel)` commits)
- [x] Tutorials covering V2 launches and creator fees ([tutorials/46](tutorials/46-usdc-pair-launches.md), [tutorials/47](tutorials/47-v2-creator-fees.md))
- [x] `launch-usdc-pair` skill for Claude Code
- [ ] Channel bot emits V2 trades with USDC vs WSOL pair labels (currently labels all as SOL)
- [ ] Dashboard surface for USDC-paired curves (separate volume/TVL columns)
- [ ] Claim tracker recognises V2 `CollectCreatorFeeEvent`

### MEV resilience

- [x] Tutorials 48–50 (Jito bundles, RPC resilience, MEV defense)
- [x] `jito-bundles` and `mev-protection` skills
- [x] `jito-bundler`, `rpc-strategist`, `mev-defender` agents
- [ ] First-class bundle API in `@pumpkit/core` (currently each bot rolls its own)
- [ ] Tip-percentile poller as a shared core service
- [ ] Multi-provider RPC pool in `packages/core/src/solana/rpc.ts`

### Observability

- [ ] Metrics surface in `@pumpkit/core/health` for all RPC roles (reader/streamer/sender)
- [ ] Slot-lag tracking across providers, exposed as a Prometheus endpoint
- [ ] SSE-client-count gauge in monitor + web

## Next (1–3 months out)

### Launch / trade primitives

- Atomic launch+buy helper in `@pumpkit/core` that uses a Jito bundle by default
- Wallet-rotation pool with vanity pre-grinding service
- Chunked-buy helper with retry-on-revert
- Adversarial-simulation helper that uses `@nirholas/pump-sdk` typed events

### Monitor + dashboard

- Multi-tenant dashboard (per-deployer views)
- Historical event store with replay (currently events are forward-only via SSE)
- Channel-bot filter DSL (subscribe to a slice of events without code changes)

### Developer ergonomics

- ADR-driven architecture docs (foundation in [docs/adr/](docs/adr/))
- Cookbook section of `docs/` with ready-to-copy recipes
- Claude Code skills for every package (we have `launch-usdc-pair`, `jito-bundles`, `mev-protection`, `event-streaming` — more to come)

## Later (directional, not committed)

- **Mobile dashboard** (PWA, push notifications)
- **i18n for the channel bot** (the `defi-agents` package already has 18 languages — extend the pattern)
- **Plugin marketplace** with on-chain payment via x402 (the protocol exists; we'd be a flagship integrator)
- **Anchor-IDL-driven decoder generation** in case the SDK ever drifts from the on-chain layout ([ADR 0001](docs/adr/0001-typed-sdk-decoders.md) alternative C)
- **Cross-protocol support**: extend the bot scaffold to other launchpads (the architecture supports it; we haven't prioritised it)
- **AI-driven trade execution** with risk caps (`defi-agents` package is the starting point)

## Won't do (right now)

- **Self-custodial wallet UX in the dashboard.** The dashboard is read-only by design. Trading flows go through bots with explicit, locally-signed keypairs.
- **Hosted RPC service.** PumpKit is BYO-RPC. We won't run infrastructure for users.
- **Telegram-Mini-App version of the dashboard.** Not in scope — the dashboard targets desktop browsers.
- **Closed-source releases.** Everything in this repo stays MIT-licensed.

## How priorities are set

Roughly, in order:

1. **Protocol changes.** When pump.fun ships a new instruction set (like V2/USDC on 2026-05-21), supporting it is unconditionally top priority.
2. **Security incidents or near-misses.** [ADR 0003](docs/adr/0003-tmp-scratch-policy.md) was driven by one; expect more in this category.
3. **Cross-package wins.** Work that lifts every consumer (e.g., a shared bundle API) beats work that helps a single package.
4. **Community asks with clear use cases.** Open a discussion. We read them.
5. **Maintainer interest.** This is a side project for the maintainers. Honest reality.

## Versioning

`@pumpkit/*` packages follow semver:

- **Patch**: bug fix, no API change
- **Minor**: additive feature, no breaking change
- **Major**: breaking change to public API or peer-dep range

Major bumps come with a migration note in [CHANGELOG.md](CHANGELOG.md). For protocol-driven majors (e.g., a future V3), an ADR will document the migration plan.

## See also

- [CHANGELOG.md](CHANGELOG.md) — historical release notes
- [docs/architecture.md](docs/architecture.md) — current architecture
- [docs/adr/](docs/adr/) — decision history
- [.github/DISCUSSION_TEMPLATE](./.github/DISCUSSION_TEMPLATE/) — how to propose roadmap changes
