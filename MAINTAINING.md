# Maintaining PumpKit

> Operational runbook for maintainers. If you're not on the maintainer list yet, see [GOVERNANCE.md](GOVERNANCE.md). For contribution guidance, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Daily / weekly cadence

| Frequency | Task | Why |
|---|---|---|
| Daily | Skim issues + PRs (5 min) | Catch security or "we're broken" reports fast |
| Weekly | Triage + label backlog | Keep `needs-triage` count near zero |
| Weekly | Review Dependabot PRs | They batch into [groups](.github/dependabot.yml) — usually 5–15 min |
| Bi-weekly | Status update on STATUS.md | What shipped, what's queued |
| Monthly | Cut a release if changes warrant | Don't sit on changesets too long |
| Quarterly | Security audit, dependency overhaul | See [security checklist](prompts/04-complete-security-checklist.md) |

## Releasing

End-to-end release workflow:

1. **Confirm gates are green:**
   ```bash
   npm run typecheck
   npm run test
   npm run lint
   bash tools/audit-dependencies.sh
   ```
2. **Verify Changesets PR is up-to-date.** If you've merged PRs with changesets since last release, the release-bot should have an open "Version Packages" PR.
3. **Review the version bumps** in that PR. Patch / minor / major must match semver intent. Any breaking change is **major, always.**
4. **Read the aggregated CHANGELOG** in the PR. If a changeset is too terse, edit it before merging.
5. **Merge the "Version Packages" PR.** This triggers [.github/workflows/release.yml](.github/workflows/release.yml) → `npx changeset publish`.
6. **Verify on npm:**
   ```bash
   npm view @pumpkit/core version
   npm view @pumpkit/monitor version
   ```
7. **Update [STATUS.md](STATUS.md)** with the new version and headline notes.
8. **Tag the commit** if Changesets didn't (newer setups do this automatically; verify):
   ```bash
   git tag -a "v$(node -p "require('./packages/core/package.json').version")" -m 'release: core X.Y.Z'
   git push --tags
   ```

Use the [release-prep agent](.claude/agents/release-prep.md) for assistance and the [/release-prep](.claude/commands/release-prep.md) slash command to drive it.

## Reviewing PRs

A good PR review answers four questions:

1. **Does it do what the PR description says?** Reject if scope is bigger than advertised.
2. **Does it ship intent + tests + docs together?** Code without test is incomplete; docs come later only for purely internal refactors.
3. **Is it a major change?** If yes, does it carry a changeset marking the bump correctly?
4. **Will it bite future-you?** Architectural footguns are cheaper to push back on at review than to refactor later.

Reviewers should not:

- Block on style if the diff respects [.editorconfig](.editorconfig) and Prettier.
- Demand new tests for code paths the PR doesn't touch.
- Require the PR to also fix unrelated bugs.

## Handling Dependabot PRs

[Dependabot config](.github/dependabot.yml) groups bumps into:

- `typescript-tooling` — TS, vitest, types
- `solana` — `@solana/*`, `@nirholas/pump-sdk`
- `bot-runtime` — grammy and friends

Triage rule of thumb:

| Group | Action |
|---|---|
| Patch within `typescript-tooling` | Merge if CI green |
| Minor within `typescript-tooling` | Merge if CI green; read release notes briefly |
| `solana` minor | Test on a devnet smoke run first — the SDK can move pump.fun-side semantics |
| `solana` major | Treat as a feature PR — read changelog, run all bot smoke tests, write a changeset |
| `bot-runtime` major | Same as above; grammY's middleware shape has shifted at major bumps |

## Security incidents

Follow [SECURITY.md](SECURITY.md). Briefly:

1. **Acknowledge** within 48h.
2. **Triage** the impact and assign severity.
3. **Fix** in a private fork if the vuln is exploitable; otherwise on a private branch.
4. **Coordinate disclosure** with the reporter and any known consumers.
5. **Release** the fix with a `SECURITY` changeset; include CVE id if assigned.
6. **Postmortem** as an issue with the `security` and `postmortem` labels — but redact specifics until consumers have upgraded.

## Branch + tag conventions

- `main` is always green. Direct pushes are blocked (or should be — enforce via branch protection if not yet).
- Tags are `v<version>` aggregated; per-package tags are managed by Changesets if enabled.
- Long-lived feature branches: avoid. Prefer many small PRs.

## Toolchain assumptions

| Tool | Minimum version | Notes |
|---|---|---|
| Node | 20 | Locked via [.nvmrc](.nvmrc), engines in [package.json](package.json) |
| npm | 10 | Comes with Node 20 |
| TypeScript | 5.7+ | Repo-wide via [tsconfig.base.json](tsconfig.base.json) |
| solana-keygen | any recent | Required for vanity work |
| Rust + cargo | optional | Only for `tools/test-rust.sh` and the Rust vanity deep-dive |

## Updating CLAUDE.md

[CLAUDE.md](CLAUDE.md) is loaded as project memory for every Claude Code session. Keep it short, accurate, and current:

- When you add a new agent / skill / command, update the tables in CLAUDE.md.
- When you change a convention (storage path, env name, etc.), update CLAUDE.md and the relevant doc page.
- Don't paste long explanations into CLAUDE.md — link to docs/ or tutorials/.

## Updating ADRs

Architectural Decision Records live in [docs/adr/](docs/adr/). When you make a load-bearing architectural call:

1. Copy [docs/adr/README.md](docs/adr/README.md) format.
2. Number sequentially.
3. Mark status (`proposed`, `accepted`, `superseded by …`).
4. Don't edit shipped ADRs — supersede with a new one.

## When to say no

A common maintainer failure is saying yes too much. It's fine — even kind — to close a PR or issue with a polite explanation:

- "This adds a feature outside the project's scope."
- "We considered this in [ADR XXXX] and chose a different direction."
- "The cost of this is higher than the benefit at our current size."

Linking to a written rationale beats relitigating in every issue.

## See also

- [GOVERNANCE.md](GOVERNANCE.md) — who decides what
- [CONTRIBUTING.md](CONTRIBUTING.md) — onboarding for new contributors
- [TESTING.md](TESTING.md) — how the test suite is structured
- [SECURITY.md](SECURITY.md) — disclosure policy
- [STATUS.md](STATUS.md) — current state
- [ROADMAP.md](ROADMAP.md) — where we're going
