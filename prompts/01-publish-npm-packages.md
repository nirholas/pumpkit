# Publish the `@pumpkit/*` packages to npm

## What
Prepare the four library packages in this monorepo for publishing to npm under the `@pumpkit` scope and publish version `1.0.0` of each. The four packages to publish are `@pumpkit/core`, `@pumpkit/channel`, `@pumpkit/claim`, and `@pumpkit/tracker`. `@pumpkit/monitor` is currently marked `"private": true` and `@pumpkit/web` is the dashboard app — leave both unpublished.

Once done, update `STATUS.md` so the "npm packages not yet published" known issue and the "Register @pumpkit npm org and publish packages" next-step are removed, and bump the `docs/npm.md` table so each package row reads `✅ Published` rather than `✅ Ready`.

## Where
- Monorepo root: `/workspaces/pumpkit`
- Per-package manifests: `packages/{core,channel,claim,tracker}/package.json`
- Docs to refresh: `STATUS.md`, `docs/npm.md`

## Why now
The framework is feature-complete (per `STATUS.md`), tutorials and docs reference `npm install @pumpkit/*` commands, and downstream consumers cannot follow the documented quick-start until the packages exist on the registry. This is the last thing blocking external adopters.

## Reference
- `STATUS.md` — see the **Package Status** table and the **Known Issues** / **Suggested Next Steps** sections
- `docs/npm.md` — currently lists every row as "✅ Ready"; flip to "✅ Published" once live
- npm scope docs: https://docs.npmjs.com/creating-and-publishing-scoped-public-packages

## Implementation

1. **Register the `@pumpkit` org on npm** (one-time). If `npm org ls @pumpkit` errors, run:
   ```bash
   npm login                                  # interactive; uses the maintainer's npm account
   npm org create pumpkit                     # creates the org
   ```
   Skip this step if `npm org ls @pumpkit` already lists the maintainer.

2. **Audit each manifest** at `packages/{core,channel,claim,tracker}/package.json`. Every published package must have:
   - `"name": "@pumpkit/<package>"` (already present)
   - `"version": "1.0.0"` (already present)
   - `"license": "MIT"` — add if missing (the root `LICENSE` is MIT)
   - `"repository": { "type": "git", "url": "https://github.com/nirholas/pumpkit.git", "directory": "packages/<package>" }`
   - `"homepage": "https://github.com/nirholas/pumpkit#readme"`
   - `"bugs": { "url": "https://github.com/nirholas/pumpkit/issues" }`
   - `"publishConfig": { "access": "public" }` — required for scoped packages to publish as public
   - `"files": ["dist", "README.md", "LICENSE"]` — only ship build output + docs
   - `"main": "dist/index.js"`, `"types": "dist/index.d.ts"` (core already has them; the bot packages need to add them so consumers can do `node node_modules/@pumpkit/monitor/dist/index.js`-style usage if relevant — for bot packages, also add `"bin"` entries pointing at `dist/index.js` if they are CLIs)
   - `"prepublishOnly": "npm run build"` script — guarantees `dist/` is fresh before publish

3. **Copy the root `LICENSE`** into each package directory so it ships in the tarball:
   ```bash
   for p in core channel claim tracker; do cp LICENSE packages/$p/LICENSE; done
   ```

4. **Ensure each package has a `README.md`**. `@pumpkit/core` already does. For the bot packages, copy the existing `packages/<pkg>/README.md` if it exists, otherwise create a minimal one (1-2 paragraphs: what it is, install command, quick-start link to the docs site).

5. **Build everything cleanly** from the root:
   ```bash
   npm install
   npm run build
   npm run typecheck
   npm run test                # @pumpkit/core has vitest tests
   ```
   All four packages must produce a `dist/` directory with `index.js` and `index.d.ts`.

6. **Dry-run each publish** to confirm the tarball contents are sane:
   ```bash
   for p in core channel claim tracker; do
       (cd packages/$p && npm publish --dry-run --access public)
   done
   ```
   Look at the `Tarball Contents` block. Reject any tarball that includes `src/`, `tsconfig.json`, or test files — fix the `files` field in that package's manifest if so.

7. **Publish** in dependency order (`core` first because `channel`/`claim`/`tracker` peer-depend on it):
   ```bash
   (cd packages/core    && npm publish --access public)
   (cd packages/channel && npm publish --access public)
   (cd packages/claim   && npm publish --access public)
   (cd packages/tracker && npm publish --access public)
   ```

8. **Update docs**:
   - In `STATUS.md`, drop Known Issue #1 ("npm packages not yet published") and Suggested Next Step #1 ("Register `@pumpkit` npm org and publish packages"). Bump the **Last updated** date to today.
   - In `docs/npm.md`, change each `✅ Ready` to `✅ Published` in the package table and add a short note above the table: `> Published to npm — install with the commands below.`

## Verification
```bash
# All four packages must be resolvable from the public registry
for p in core channel claim tracker; do
    npm view @pumpkit/$p version
done
# Expected output: 1.0.0 (×4)

# A clean install from a temp directory must succeed
mkdir -p /tmp/pumpkit-publish-check && cd /tmp/pumpkit-publish-check
npm init -y >/dev/null
npm install @pumpkit/core @pumpkit/channel @pumpkit/claim @pumpkit/tracker
node -e "require('@pumpkit/core'); console.log('core resolves')"
```

If `npm publish` fails with `403 Forbidden — You do not have permission to publish "@pumpkit/<pkg>"`, the npm account is either not a member of the `pumpkit` org or 2FA is required — surface the error and stop. Do not push partial publishes.

## Cleanup
```bash
rm /workspaces/pumpkit/prompts/01-publish-npm-packages.md
```

## Commit and push (as nirholas)
```bash
cd /workspaces/pumpkit
git add packages/*/package.json packages/*/LICENSE packages/*/README.md STATUS.md docs/npm.md prompts/01-publish-npm-packages.md
git -c user.name=nirholas -c user.email=nirholas@users.noreply.github.com commit -m "$(cat <<'MSG'
chore(release): publish @pumpkit/{core,channel,claim,tracker} 1.0.0 to npm

Adds the missing npm-publish metadata (license, repository, publishConfig,
files, prepublishOnly) to each library package, ships the MIT LICENSE in
every tarball, and publishes the four libraries under the @pumpkit scope.

STATUS.md and docs/npm.md are updated to reflect that the packages are
live on the public registry. @pumpkit/monitor stays private (it is the
deployable service, not a library) and @pumpkit/web is the dashboard
app, not a publishable library.
MSG
)"
git push
```

If `git push` fails with a 403, leave the commit local and surface the auth error — do not retry with `--force` and do not skip hooks.
