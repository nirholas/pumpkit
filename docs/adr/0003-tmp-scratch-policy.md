# ADR 0003 — `tmp/` for ephemeral scratch work

- **Status**: Accepted
- **Date**: 2026-05-21
- **Drivers**: security review after a near-miss keypair commit

## Context

PumpKit accumulates short-lived working files: launch keypairs being ground out, leaked-launch investigation scratch, throwaway env files, and bot-specific test mints. Without a convention, these files end up scattered across the repo, frequently in places where `.gitignore` doesn't cover them.

The acute risk is keypair leakage. A pump.fun deployer keypair committed to a public repo is exfiltration-ready in seconds — bots scrape GitHub for `*.json` files matching the keypair format. A 2026-05-21 audit found a `funder.json` keypair sitting at the project root, gitignored only because it happened to match a pattern in `.gitignore`. One filename rename away from disaster.

We need:

- A **single, well-known location** for scratch work
- A **`.gitignore` rule** broad enough that no one has to remember to ignore each new file
- A **review surface** so the rule's exceptions (intentionally tracked scratch files) are visible
- A **convention** that Claude Code and human contributors both follow

## Decision

All ephemeral scratch work goes under **`tmp/`** at the repo root. The `.gitignore` excludes it broadly, with per-subdirectory exceptions for the rare files we *do* want tracked.

Conventions:

- `tmp/` is the only sanctioned location for keypairs, throwaway env files, scratch test mints, and investigation working files.
- Subdirectories under `tmp/` are named by their purpose: `tmp/leaked-launch/`, `tmp/vanity-usdc/`, `tmp/scratch-tradebot/`.
- `.gitignore` covers `tmp/` recursively. Files explicitly meant to be tracked use `!` exceptions and are documented per-subdirectory.
- Keypair files in `tmp/` must be mode `600`. The check is enforced by [tools/check-file-permissions.sh](../../tools/check-file-permissions.sh) and the grind wrapper sets it automatically.
- Reads on sensitive scratch paths (`tmp/leaked-launch/funder.json`, `tmp/**/keypair*.json`, `tmp/**/*.env`) are blocked by [.claude/settings.json](../../.claude/settings.json) so Claude Code can't accidentally cat them into chat.

## Consequences

**Positive:**

- One place to look (and one place to clean up). Reviewers don't have to grep the whole tree for stray keypairs.
- Broad `.gitignore` coverage means no one has to remember to add a new ignore rule per file.
- Claude Code's permission denylist provides defense-in-depth against accidental exfiltration through chat.
- The mode-600 enforcement gives us a tooling-level check that runs on dev machines and in CI.

**Negative:**

- New contributors don't know about the convention until they read the docs or stub their toe on it. Mitigation: CLAUDE.md surfaces it; CONTRIBUTING.md cross-references.
- A determined committer can still `git add tmp/keypair.json -f`. The convention is a guardrail, not a wall.
- `tmp/` accumulates cruft over time. Periodic cleanup is a maintenance task.

**Future obligations:**

- Anything that wants to *survive* across sessions belongs in a tracked path under `packages/` or `tools/` or `docs/`, not in `tmp/`.
- New sensitive-file patterns should be added to both `.gitignore` and `.claude/settings.json`'s deny list.
- The `tools/check-file-permissions.sh` script should be wired into CI (not just dev local) so a missed mode-600 fails a build.

## Considered alternatives

### A. Per-package `scratch/` directories

Each package gets its own scratch subdir.

**Rejected.** Loses the "one place to look" property. Reviewers would have to know about each package's local convention.

### B. Out-of-repo scratch (e.g., `~/pumpkit-scratch/`)

Keep scratch entirely outside the repo.

**Rejected.** Onboarding gets harder ("where do I put X?"), and CI/devcontainer flows that bind-mount the repo lose access to the scratch tree. Keeping it in-repo (but gitignored) is the practical compromise.

### C. Encrypted keypair store (e.g., `sops`)

Encrypt all keypairs at rest with a team-shared key.

**Deferred.** Higher security but significant workflow friction. Worth revisiting if the team grows or compliance requirements demand it. For now, mode 600 + `.gitignore` + Claude permission deny is enough.

## See also

- [.gitignore](../../.gitignore)
- [tools/check-file-permissions.sh](../../tools/check-file-permissions.sh)
- [.claude/settings.json](../../.claude/settings.json)
- [SECURITY.md](../../SECURITY.md)
- [CLAUDE.md](../../CLAUDE.md) — keypair handling rules
