# Tag, publish, and propagate @nirholas/pump-sdk@1.33.0

## What
Tag the v1.33.0 release on `nirholas/pump-fun-sdk`, run `npm publish` to push the package to the public registry, then in `/workspaces/pumpkit` run `npm install` so downstream consumers pick up the new peer dep at `^1.33.0`.

## Where
- SDK repo: `/workspaces/pump-fun-sdk` (origin: `https://github.com/nirholas/pump-fun-sdk.git`)
- Downstream: `/workspaces/pumpkit` (origin: `https://github.com/nirholas/pumpkit.git`)

## Why now
The v1.33.0 commit (V2 / USDC quote support) is in `/workspaces/pump-fun-sdk` but not yet on npm. Without a publish, downstream packages — including `@pumpkit/core` which pins `@nirholas/pump-sdk@^1.33.0` — can't resolve the dependency, and pumpkit's V2 event refactor (prompt 06) will fail at `npm install`.

## Preflight (must pass before publishing)
```bash
cd /workspaces/pump-fun-sdk

# 1. Confirm version
node -e "console.log(require('./package.json').version)"
# Expected: 1.33.0

# 2. Confirm we are at the v1.33.0 commit on main
git log -1 --format='%H %s'

# 3. Clean tree
git status -s

# 4. Build + test
npm run build
npx jest

# 5. Verify the bundled artifact actually exports the V2 surface
node -e "const sdk = require('./dist/index.js'); console.log({
  hasBuyV2: typeof sdk.PUMP_SDK?.buyV2Instruction,
  hasSellV2: typeof sdk.PUMP_SDK?.sellV2Instruction,
  hasCollectV2: typeof sdk.PUMP_SDK?.collectCreatorFeeV2Instruction,
  USDC: sdk.USDC_MINT?.toBase58(),
  WSOL: sdk.WSOL_MINT?.toBase58(),
  buybackCount: sdk.BUYBACK_FEE_RECIPIENTS?.length,
});"
# Expected: hasBuyV2/sellV2/collectV2 all 'function', USDC = EPjFW…, buybackCount = 8

# 6. Dry-run the publish to inspect the tarball contents
npm publish --dry-run
# Confirm dist/, src/, README.md, CHANGELOG.md, LICENSE are all in the file list.
```

If any preflight step fails, **stop and surface the error to the user** — do not proceed to the real publish.

## Publish
```bash
cd /workspaces/pump-fun-sdk

# 1. Confirm npm login state — must be authenticated as the owner of @nirholas
npm whoami

# 2. Tag the release on the current commit
git tag -a v1.33.0 -m "v1.33.0 — V2 / USDC quote support (2026-05-21 program upgrade)"
git push origin v1.33.0   # if push fails with 403, leave the tag local and surface

# 3. Publish to npm
npm publish

# 4. Sanity-check it landed
npm view @nirholas/pump-sdk@1.33.0 version
```

If `npm publish` fails (auth, network, version conflict, etc.), surface the exact error to the user. Do **not** attempt force-publish, do not bump version to retry — that requires user input.

## Propagate downstream
```bash
cd /workspaces/pumpkit
npm install
# Confirm node_modules now has 1.33.0
node -e "console.log(require('@nirholas/pump-sdk/package.json').version)"
# Expected: 1.33.0

# Smoke-test that the new exports resolve from a package consumer
node -e "const s = require('@nirholas/pump-sdk'); console.log(typeof s.PUMP_SDK?.buyV2Instruction);"
```

If `npm install` modifies `package-lock.json`, stage and commit it:
```bash
cd /workspaces/pumpkit
git add package-lock.json
# If individual workspace lockfiles changed too, stage them as well:
git add packages/*/package-lock.json 2>/dev/null || true
git -c user.name=nirholas -c user.email=nirholas@users.noreply.github.com commit -m "$(cat <<'MSG'
chore: lockfile bump — install @nirholas/pump-sdk@1.33.0

Picks up the V2 / USDC quote-mint support published in
@nirholas/pump-sdk@1.33.0 for the 2026-05-21 program upgrade.
MSG
)"
git push   # if push fails with 403, surface and leave local
```

## Cleanup
```bash
rm /workspaces/pumpkit/prompts/v2/07-publish-sdk-1.33.0.md
```

## Failure-mode notes
- **`npm publish` 403** — token isn't allowed to publish under `@nirholas`. Run `npm login --scope=@nirholas` and rerun the preflight; do not proceed without surfacing this.
- **`git push origin v1.33.0` 403** — the gh CLI token in this environment may be for a different GitHub user. Leave the tag local (`git tag v1.33.0` already created it) and tell the user they need to push the tag themselves.
- **`npm install` resolves a different version** — check the workspace overrides in `package.json` — they may pin an older minor.
