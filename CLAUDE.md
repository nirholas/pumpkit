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
| Step-by-step tutorials | [tutorials/](tutorials/) (45+ numbered) |
| Example apps | [examples/](examples/) |
| Multi-step refactor prompts | [agent-prompts/](agent-prompts/) (numbered 01–30) |
| One-shot workflow prompts | [prompts/](prompts/) + [prompts/v2/](prompts/v2/) |
| Shell + TS utilities | [tools/](tools/) |
| Current open work | [STATUS.md](STATUS.md) |
| Security policy | [SECURITY.md](SECURITY.md) and [security/](security/) |

## V2 / USDC quote pair (rolled out 2026-05-21)

Pump.fun enabled USDC as a quote mint for create + trade on 2026-05-21. Important points when working on launch / trade code:

- **USDC-paired coins** can only be traded with V2 instructions.
- **SOL-paired coins** still trade in native SOL even though the quote mint is passed as wSOL. Legacy instructions continue to work for SOL.
- Authoritative reference: [pump-fun/pump-public-docs](https://github.com/pump-fun/pump-public-docs).
- Local tutorials: [tutorials/46-usdc-pair-launches.md](tutorials/46-usdc-pair-launches.md), [tutorials/47-v2-creator-fees.md](tutorials/47-v2-creator-fees.md).

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
