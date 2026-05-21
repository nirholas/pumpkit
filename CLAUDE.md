# CLAUDE.md — PumpKit project memory

Project memory for Claude Code sessions. Loaded into context on every interaction in this repo.

## What this is

PumpKit is a TypeScript monorepo (Turborepo + npm workspaces) of pump.fun bots and shared infrastructure. Packages live in [packages/](packages/) and publish to npm under the `@pumpkit/*` scope.

| Package | What it does |
|---|---|
| [@pumpkit/core](packages/core/) | Shared framework: logger, config, health, bot scaffold, formatter, monitors, storage, SDK bridge |
| [@pumpkit/monitor](packages/monitor/) | DM bot + REST API + SSE stream |
| [@pumpkit/channel](packages/channel/) | Channel broadcast bot |
| [@pumpkit/claim](packages/claim/) | Fee-claim tracker |
| [@pumpkit/tracker](packages/tracker/) | Call-tracking leaderboard bot |
| [@pumpkit/web](packages/web/) | Dashboard UI with live SSE feed |

## How to develop

```bash
npm install                    # bootstrap workspaces
npm run build                  # turbo build all
npm run typecheck              # tsc --noEmit across all
npm run test                   # vitest in each package
npm run lint                   # turbo lint
npm run dev --workspace=@pumpkit/monitor   # run one package in watch mode
```

Or via `make` — [Makefile](Makefile) has shortcuts for each bot (`make dev-monitor`, `make docker-tracker`, etc.).

**Node >= 20** is required. Tools/scripts may also call `npx tsx` for TS files.

## Conventions

- **Keypair files** must be mode `600`. The repo has [tools/check-file-permissions.sh](tools/check-file-permissions.sh) and the [tools/generate-vanity.sh](tools/generate-vanity.sh) wrapper sets this automatically.
- **Never commit keypairs or `.env`** — `.gitignore` covers these, but double-check before staging.
- **Ephemeral scratch work** goes in [tmp/](tmp/) (gitignored where it matters; check per-subdir).
- **Solana program constants** live in [packages/core/src/solana/programs.ts](packages/core/src/solana/programs.ts).
- **Event decoders** are typed and live in [@nirholas/pump-sdk](https://www.npmjs.com/package/@nirholas/pump-sdk) (peer dep) — prefer SDK types over re-decoding.

## Where things live

| Need | Look in |
|---|---|
| Public-facing docs | [docs/](docs/) (40+ pages) |
| Architecture decision records | [docs/adr/](docs/adr/) |
| Step-by-step tutorials | [tutorials/](tutorials/) (50+ numbered) |
| Example apps | [examples/](examples/) |
| Multi-step refactor prompts | [agent-prompts/](agent-prompts/) (numbered 01–30) |
| One-shot workflow prompts | [prompts/](prompts/) + [prompts/v2/](prompts/v2/) |
| Shell + TS utilities | [tools/](tools/) |
| Current open work | [STATUS.md](STATUS.md) |
| Public roadmap | [ROADMAP.md](ROADMAP.md) |
| Security policy | [SECURITY.md](SECURITY.md) and [security/](security/) |
| Claude Code agents | [.claude/agents/](.claude/agents/) |
| Claude Code slash-commands | [.claude/commands/](.claude/commands/) |
| Claude Code skills | [.claude/skills/](.claude/skills/) |

### Specialised Claude Code agents

Invoke these via `Agent` when the task matches:

| Agent | Use for |
|---|---|
| [pump-event-decoder](.claude/agents/pump-event-decoder.md) | Decoding events/instructions, V1 vs V2 distinctions |
| [security-auditor](.claude/agents/security-auditor.md) | Auditing keypair/secret handling, scope reviews |
| [vanity-grinder](.claude/agents/vanity-grinder.md) | Vanity address grinding, suffix conventions |
| [jito-bundler](.claude/agents/jito-bundler.md) | Jito bundle design, tip strategy, landing debugging |
| [rpc-strategist](.claude/agents/rpc-strategist.md) | RPC topology, failover, rate-limit handling |
| [migration-detector](.claude/agents/migration-detector.md) | Graduation detection, AMM handoff |
| [mev-defender](.claude/agents/mev-defender.md) | Sandwich/copy-trade defenses, wallet rotation |

### Slash-commands

| Command | Purpose |
|---|---|
| [/audit-deps](.claude/commands/audit-deps.md) | Dependency audit |
| [/check-funding](.claude/commands/check-funding.md) | Pump-funding source check on a pubkey |
| [/grind-vanity](.claude/commands/grind-vanity.md) | Grind a vanity keypair via the project's wrapper |
| [/verify-keypair](.claude/commands/verify-keypair.md) | Verify a keypair file's pubkey + mode |
| [/simulate-tx](.claude/commands/simulate-tx.md) | Dry-run a tx before sending |
| [/inspect-curve](.claude/commands/inspect-curve.md) | Decode bonding-curve state |
| [/bundle-trace](.claude/commands/bundle-trace.md) | Trace a Jito bundle's landing status |
| [/decode-event](.claude/commands/decode-event.md) | Decode every pump event from a tx signature |

### Skills

| Skill | When to reach for it |
|---|---|
| [launch-usdc-pair](.claude/skills/launch-usdc-pair/SKILL.md) | USDC-paired V2 launches |
| [jito-bundles](.claude/skills/jito-bundles/SKILL.md) | Building, debugging, tuning Jito bundles |
| [mev-protection](.claude/skills/mev-protection/SKILL.md) | Designing or auditing MEV defenses |
| [event-streaming](.claude/skills/event-streaming/SKILL.md) | WebSocket + SSE pipelines for pump events |

## V2 / USDC quote pair (rolled out 2026-05-21)

Pump.fun enabled USDC as a quote mint for create + trade on 2026-05-21. Important points when working on launch / trade code:

- **USDC-paired coins** can only be traded with V2 instructions.
- **SOL-paired coins** still trade in native SOL even though the quote mint is passed as wSOL. Legacy instructions continue to work for SOL.
- Authoritative reference: [pump-fun/pump-public-docs](https://github.com/pump-fun/pump-public-docs).
- Local tutorials: [tutorials/46-usdc-pair-launches.md](tutorials/46-usdc-pair-launches.md), [tutorials/47-v2-creator-fees.md](tutorials/47-v2-creator-fees.md).

## Production hardening

For bots running in adversarial environments (most pump.fun launches):

- **Bundles for atomicity** — [tutorials/48-jito-bundle-strategies.md](tutorials/48-jito-bundle-strategies.md) + [jito-bundles skill](.claude/skills/jito-bundles/SKILL.md)
- **RPC resilience** — [tutorials/49-rpc-resilience.md](tutorials/49-rpc-resilience.md) + [rpc-strategist agent](.claude/agents/rpc-strategist.md)
- **MEV defense** — [tutorials/50-mev-defense-patterns.md](tutorials/50-mev-defense-patterns.md) + [mev-protection skill](.claude/skills/mev-protection/SKILL.md)
- **Curve internals** — [tutorials/51-bonding-curve-internals.md](tutorials/51-bonding-curve-internals.md) + [migration-detector agent](.claude/agents/migration-detector.md)
- **Event streaming** — [event-streaming skill](.claude/skills/event-streaming/SKILL.md)

## When in doubt

- Read [STATUS.md](STATUS.md) for what's currently in-progress vs done.
- Read [docs/architecture.md](docs/architecture.md) for the system shape.
- Read [docs/getting-started.md](docs/getting-started.md) for setup.
- Run `make help` to see the supported workflows.

## Things to avoid

- Don't introduce new top-level directories without checking — the repo's layout is intentional.
- Don't bypass the `tools/` wrappers (e.g., raw `solana-keygen grind`) for keypair generation — the wrappers enforce permissions and validate inputs.
- Don't commit anything from [tmp/](tmp/) — it's working state.
- Don't add a fix for a problem that doesn't exist. If a test passes and the code is clear, leave it.
