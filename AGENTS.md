# AGENTS.md

Operating notes for AI coding agents (Claude Code, Codex, Cursor, Copilot and others) working in this repository. Everything here is derived from the files actually in the tree, so trust it over guesses, and update it when the facts change.

## What this repository is

Open-source framework for building PumpFun Telegram bots on Solana. Claim monitors, channel feeds, group trackers, whale alerts - build your own or use ours.

- Homepage: https://nirholas.github.io/pumpkit/
- Source: https://github.com/nirholas/pumpkit
- Primary language: TypeScript
- License: Other (see the LICENSE file)

## Repository layout

- `agent-prompts/`
- `docs/`
- `examples/`
- `live/`
- `packages/`
- `prompts/`
- `security/`
- `tmp/`
- `tools/`
- `tutorials/`
- `README.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CHANGELOG.md`
- `CLAUDE.md`
- `package.json`
- `Makefile`

## Setup

```bash
npm install
```

## Commands

| Task | Command |
|---|---|
| dev | `npm run dev` |
| build | `npm run build` |
| test | `npm test` |
| lint | `npm run lint` |
| typecheck | `npm run typecheck` |
| make help | `make help` |
| make install | `make install` |
| make build | `make build` |
| make dev | `make dev` |
| make dev-monitor | `make dev-monitor` |
| make dev-tracker | `make dev-tracker` |
| make dev-channel | `make dev-channel` |
| make dev-claim | `make dev-claim` |

Run the test and lint commands above before you consider a change finished. If a command fails on code you did not touch, say so in your report instead of silently skipping it.

## Conventions

- This is a monorepo (`workspaces` in `package.json`); run scripts from the root unless a package README says otherwise.
- Indentation and line endings follow `.editorconfig`.
- `.env` files are gitignored; never commit credentials, and read configuration from environment variables.
- Commit messages follow Conventional Commits (`type(scope): summary`), matching the existing history.
- Read `CONTRIBUTING.md` before opening a pull request.
- User-visible changes get an entry in `CHANGELOG.md`.
- `CLAUDE.md` holds additional, more detailed operating rules; it takes precedence where the two overlap.
- Read the surrounding code before adding to it, and match its naming, file organisation and error-handling style.
- Keep `README.md` accurate: if a change alters behaviour, commands or configuration, update the docs in the same commit.
- Do not leave TODO comments, stub functions, placeholder data or commented-out code behind. Finish what you start or leave it out.
- Small, focused commits with a subject line that describes the change, not the act of committing.

## Where to raise things

- Bugs and feature requests: https://github.com/nirholas/pumpkit/issues
- Questions and ideas: https://github.com/nirholas/pumpkit/discussions
- Security issues: follow `SECURITY.md`, never a public issue.
