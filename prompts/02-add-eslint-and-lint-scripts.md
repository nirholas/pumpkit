# Add ESLint and wire `lint` scripts across the monorepo

## What
The root `package.json` exposes `npm run lint` which calls `turbo lint`, and `turbo.json` declares a `lint` task — but no package in `packages/*` actually has a `lint` script. As a result `npm run lint` reports `0 successful, 0 cached` and silently does nothing. Install ESLint at the repo root, share one flat config across packages, and wire a `lint` (and `lint:fix`) script into every package so `npm run lint` actually checks the code.

## Where
- Monorepo root: `/workspaces/pumpkit`
- New file: `eslint.config.js` at repo root
- Files to modify: every `packages/*/package.json`
- Docs to refresh: `STATUS.md` (remove the "Lint scripts missing" known issue + the related next-step)

## Why now
`STATUS.md` lists this as Known Issue #2: *"`turbo.json` references a `lint` task but no package has a `lint` script."* The framework is otherwise feature-complete and packages are about to be published — landing this before the first npm release means published packages ship a real lint baseline.

## Reference
- Existing `turbo.json` — the `lint` task is already declared, no changes needed there
- ESLint flat config docs: https://eslint.org/docs/latest/use/configure/configuration-files
- TypeScript-ESLint flat config: https://typescript-eslint.io/getting-started

## Implementation

1. **Install ESLint and the TypeScript plugin at the repo root** (workspaces hoist this for every package):
   ```bash
   npm install -D -W eslint @eslint/js typescript-eslint eslint-plugin-react eslint-plugin-react-hooks
   ```
   (The React plugins are needed for `packages/web`; they're harmless for the Node packages because the config below scopes them.)

2. **Create `/workspaces/pumpkit/eslint.config.js`** as a flat config that lints every package, with stricter rules for `.ts` and a React preset for `packages/web/**/*.{ts,tsx}`:
   ```js
   import js from '@eslint/js';
   import tseslint from 'typescript-eslint';
   import react from 'eslint-plugin-react';
   import reactHooks from 'eslint-plugin-react-hooks';

   export default [
       {
           ignores: [
               '**/dist/**',
               '**/node_modules/**',
               '**/*.config.js',
               '**/*.config.ts',
           ],
       },
       js.configs.recommended,
       ...tseslint.configs.recommended,
       {
           files: ['packages/*/src/**/*.{ts,tsx}'],
           languageOptions: {
               ecmaVersion: 2023,
               sourceType: 'module',
               globals: { console: 'readonly', process: 'readonly', Buffer: 'readonly' },
           },
           rules: {
               '@typescript-eslint/no-explicit-any': 'warn',
               '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
               'no-console': 'off',
           },
       },
       {
           files: ['packages/web/src/**/*.{ts,tsx}'],
           plugins: { react, 'react-hooks': reactHooks },
           rules: {
               ...react.configs.recommended.rules,
               ...reactHooks.configs.recommended.rules,
               'react/react-in-jsx-scope': 'off',     // React 19 + Vite
               'react/prop-types': 'off',             // TS provides this
           },
           settings: { react: { version: 'detect' } },
       },
   ];
   ```

3. **Add `lint` and `lint:fix` scripts to every package's `package.json`** (`packages/core`, `packages/channel`, `packages/claim`, `packages/tracker`, `packages/monitor`, `packages/web`):
   ```jsonc
   "scripts": {
       // ...existing scripts
       "lint": "eslint src --max-warnings 0",
       "lint:fix": "eslint src --fix"
   }
   ```

4. **Run `npm run lint` from the root** and fix any genuine errors. Common categories you'll see:
   - Unused imports → delete them
   - `any` warnings → narrow to a real type where it's an obvious win; leave the `warn` rule in place otherwise
   - React hook dependency arrays → either add the missing dep or refactor; don't silence the rule unless there's a documented reason

   If the volume is large, fix the errors first (they break CI) and leave warnings for a follow-up.

5. **Add a CI step** in `.github/workflows/*.yml` if a lint job isn't already wired. If `.github/workflows/` does not exist, skip this and note it in the commit message — it can land separately.

6. **Update `STATUS.md`**:
   - Remove Known Issue #2 ("Lint scripts missing")
   - Remove the matching Suggested Next Step #2
   - Add a `Lint | ✅ In CI` row to the CI/CD table if a CI step was added; otherwise change it to `✅ Configured (locally)`
   - Bump the **Last updated** date to today

## Verification
```bash
cd /workspaces/pumpkit
npm install                             # picks up the new devDeps
npm run lint                            # must exit 0 across all packages
npm run lint -- --max-warnings=0        # stricter pass (optional but recommended)
npm run build                           # must still succeed — lint should not break the build
```

`npm run lint` should now produce real output ("Lint for @pumpkit/core … done", etc.), not the silent `0 successful` it used to.

## Cleanup
```bash
rm /workspaces/pumpkit/prompts/02-add-eslint-and-lint-scripts.md
```

## Commit and push (as nirholas)
```bash
cd /workspaces/pumpkit
git add eslint.config.js package.json package-lock.json packages/*/package.json STATUS.md prompts/02-add-eslint-and-lint-scripts.md
# include any source files that were edited to clear genuine lint errors
git add -u packages
git -c user.name=nirholas -c user.email=nirholas@users.noreply.github.com commit -m "$(cat <<'MSG'
chore(lint): wire ESLint flat config and per-package lint scripts

Adds a shared flat ESLint config at the repo root (TypeScript +
React preset for packages/web), installs the lint toolchain as
root devDependencies so workspaces hoist it, and gives every
package a real "lint" / "lint:fix" script so the existing
turbo lint task actually runs.

Resolves the STATUS.md known issue that "turbo.json references
a lint task but no package has a lint script" — npm run lint
now produces output and exits non-zero on errors.
MSG
)"
git push
```

If `git push` fails with a 403, leave the commit local and surface the auth error.
