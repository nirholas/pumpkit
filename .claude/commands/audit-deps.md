---
description: Run all dependency + permission audits before release
---

Run the project's three security scripts and report pass/fail. Equivalent to invoking the `security-auditor` agent for a one-shot pre-release check.

## Steps

1. Run all three in parallel:
   ```bash
   bash tools/audit-dependencies.sh
   bash tools/check-file-permissions.sh
   ```
   And, if there are uncommitted changes that touch `package.json` or lockfiles:
   ```bash
   git diff --stat package-lock.json packages/*/package.json
   ```
2. For each check, report:
   - **PASS** — green; nothing to do.
   - **WARN** — explain what was flagged; suggest next step.
   - **FAIL** — quote the offending line; propose a remediation (typically `npm audit fix` or pinning a version).
3. If any FAIL, **do not** propose `--no-verify` or audit-skip workarounds. Fix the root cause.

## Avoid

- Don't auto-run `npm audit fix --force` — it can change major versions and break peer deps.
- Don't ignore `cargo audit` failures even if the Rust crates feel out-of-scope; PumpKit's vanity tooling deep-dives via Rust.
