# Adopt Changesets for monorepo versioning + release notes

## What
PumpKit is a Turborepo with five publishable workspaces under `packages/*`. There is no versioning workflow today — every package is hand-bumped, and the changelog at `CHANGELOG.md` is a single root-level file with no per-package detail. Adopt `@changesets/cli` so contributors record version-impactful changes alongside their PRs, and `changeset version` + `changeset publish` drive both the bumps and the release notes.

## Where
- Monorepo root: `/workspaces/pumpkit`
- New directory: `.changeset/` (Changesets state)
- New file: `.changeset/config.json`
- Files to modify: root `package.json` (add `changeset` and `version-packages` scripts), `CHANGELOG.md` (one-time pointer note), `STATUS.md` (drop the matching next-step)
- Optional: `.github/workflows/release.yml` if a CI release flow is wanted

## Why now
Once `@pumpkit/core`, `@pumpkit/channel`, `@pumpkit/claim`, and `@pumpkit/tracker` ship to npm, downstream consumers need a predictable bump cadence and per-package changelogs. Wiring Changesets before the first published `1.0.1` patch means the very first published bump comes with a proper changelog entry — retrofitting after the fact is messy.

## Reference
- Changesets docs: https://github.com/changesets/changesets/blob/main/docs/intro-to-using-changesets.md
- Existing monorepo manifests:
    - Root `package.json` uses `workspaces: ["packages/*"]` and `turbo` for orchestration
    - Library packages (`core`, `channel`, `claim`, `tracker`) are at `version: 1.0.0`; `monitor` is `1.1.0` and private; `web` is `0.1.0` and private

## Implementation

1. **Install Changesets at the repo root** (as a workspace dev dep):
   ```bash
   npm install -D -W @changesets/cli
   ```

2. **Initialise**:
   ```bash
   npx changeset init
   ```
   This creates `.changeset/config.json` and a starter README inside `.changeset/`.

3. **Edit `.changeset/config.json`** to match this monorepo:
   ```jsonc
   {
       "$schema": "https://unpkg.com/@changesets/config/schema.json",
       "changelog": ["@changesets/changelog-github", { "repo": "nirholas/pumpkit" }],
       "commit": false,
       "fixed": [],
       "linked": [],
       "access": "public",
       "baseBranch": "main",
       "updateInternalDependencies": "patch",
       "ignore": ["@pumpkit/monitor", "@pumpkit/web"]
   }
   ```
   - `access: "public"` so scoped packages publish publicly
   - `ignore` keeps the private monitor service and the dashboard out of the version flow (they ship as containers, not on npm)
   - The GitHub changelog generator needs an additional dep:
     ```bash
     npm install -D -W @changesets/changelog-github
     ```

4. **Add scripts to the root `package.json`** so the workflow is one-liner-friendly:
   ```jsonc
   "scripts": {
       // ...existing
       "changeset": "changeset",
       "version-packages": "changeset version",
       "release": "npm run build && changeset publish"
   }
   ```

5. **Create the first changeset** documenting the current state. Run `npx changeset` interactively and pick a `minor` bump for every published package with the description: `Initial public release of @pumpkit/{core,channel,claim,tracker}.` The generated markdown should land at `.changeset/<random-name>.md` — commit it as-is.

6. **Edit `CHANGELOG.md`** at repo root to add a pointer:
   ```markdown
   # Changelog

   Per-package release notes are now managed by Changesets and live in each
   package's `CHANGELOG.md`. This top-level file documents repo-wide changes
   (tooling, structure, governance) only.
   ```

7. **(Optional but recommended)** Add `.github/workflows/release.yml` that runs on push to `main` and uses `changesets/action@v1` to open a "Version Packages" PR. Skip if the repo has no GitHub Actions yet — note in the commit message that this is a follow-up.

8. **Update `STATUS.md`**:
   - Remove the "Set up Changesets for versioning" next-step
   - Add a row to the CI/CD table: `Versioning | ✅ Changesets configured`
   - Bump the **Last updated** date

## Verification
```bash
cd /workspaces/pumpkit

# config is valid
npx changeset status

# a dry-run version bump shows the right packages
npx changeset version --snapshot dry-run-check
git diff --stat   # should touch packages/{core,channel,claim,tracker}/package.json + CHANGELOG.md files
git checkout -- . # revert the dry-run mutation; do NOT commit it

# scripts wire up
npm run changeset -- --help >/dev/null
```

## Cleanup
```bash
rm /workspaces/pumpkit/prompts/05-setup-changesets.md
```

## Commit and push (as nirholas)
```bash
cd /workspaces/pumpkit
git add .changeset/ package.json package-lock.json CHANGELOG.md STATUS.md prompts/05-setup-changesets.md
# only include the workflow if it was added
git add .github/workflows/release.yml 2>/dev/null || true
git -c user.name=nirholas -c user.email=nirholas@users.noreply.github.com commit -m "$(cat <<'MSG'
chore(release): adopt Changesets for monorepo versioning

Initialises @changesets/cli with the GitHub-changelog adapter,
ignores the private @pumpkit/monitor and @pumpkit/web workspaces,
and wires changeset / version-packages / release scripts into the
root package.json.

Lands the first changeset documenting the initial public release of
@pumpkit/{core,channel,claim,tracker} and points the top-level
CHANGELOG.md at the per-package changelogs that Changesets will
generate. The matching STATUS.md next-step is removed.
MSG
)"
git push
```

If `git push` fails with a 403, leave the commit local and surface the auth error.
