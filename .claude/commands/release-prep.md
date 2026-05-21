---
description: Prep a release — run gates, draft a changeset, update STATUS, open release PR
argument-hint: [package-name] [bump-level]
---

Drive a release of one or more `@pumpkit/*` packages through the project's gates.

## Steps

1. **Inventory the diff since last release:**
   ```bash
   git log --oneline $(git describe --tags --abbrev=0)..HEAD
   ```
   Note which packages have user-visible changes.
2. **Decide bump level** per package — patch / minor / major. **Breaking change = major, always.**
3. **Run gates in parallel:**
   ```bash
   npm run typecheck
   npm run test
   npm run lint
   bash tools/audit-dependencies.sh
   bash tools/check-file-permissions.sh
   ```
   All must pass. If any fail, **stop** and surface the failure — don't paper over.
4. **Draft a changeset:**
   ```bash
   npx changeset
   ```
   Pick the bumps. Write a summary focused on **what consumers need to do** — not what changed internally.
5. **Update [STATUS.md](../../STATUS.md)** with the upcoming release version and headline changes.
6. **Open a PR** with the changeset + status update. After merge, `.github/workflows/release.yml` opens the Release PR automatically.
7. **Merge the Release PR** to publish. Verify on npm:
   ```bash
   npm view @pumpkit/core version
   ```

## Reference materials

- Agent: `release-prep` (for sub-questions on bump decisions)
- Workflow: [.github/workflows/release.yml](../../.github/workflows/release.yml)
- Plan: [prompts/05-setup-changesets.md](../../prompts/05-setup-changesets.md)

## Avoid

- Skipping audit failures.
- Patch-bumping a breaking change.
- Manually editing version fields — let `npx changeset version` do it.
- Publishing from a dirty tree.
