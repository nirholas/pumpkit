# Deploy the `@pumpkit/web` dashboard to Vercel

## What
`@pumpkit/web` is the dashboard + docs site under `packages/web` and a `vercel.json` is already at repo root pointing the build at `npx turbo build --filter=@pumpkit/web` with output in `packages/web/dist`. Get the site live on Vercel: link the repo to a Vercel project, configure the required env vars, ship the first production deploy, and add a `Deploy` badge + URL to `README.md` and `STATUS.md`.

## Where
- Existing config: `/workspaces/pumpkit/vercel.json`
- Site source: `packages/web`
- Docs to refresh: `README.md`, `STATUS.md`, `docs/deployment.md` (if it exists), `docs/web-dashboard.md` (create if it doesn't)
- New file (optional): `packages/web/vercel.json` if env-var scoping needs to live per-package

## Why now
The dashboard is built (`STATUS.md` lists every page as `✅ Built`) and the framework is about to publish to npm. Adopters following the quick-start will want a hosted demo to click through; deploying to Vercel before the npm release lets us link the live URL from the npm READMEs and the docs site.

## Reference
- Existing `vercel.json`:
  ```json
  {
      "buildCommand": "npx turbo build --filter=@pumpkit/web",
      "outputDirectory": "packages/web/dist",
      "installCommand": "npm install",
      "framework": null
  }
  ```
- `turbo.json` passes through `VERCEL_*` env vars already (see `globalPassThroughEnv`)
- Dashboard env vars are documented in `packages/web/.env.example` (currently just `VITE_API_URL`)
- Vercel CLI reference: https://vercel.com/docs/cli

## Implementation

1. **Verify the build works locally** with the same command Vercel will run:
   ```bash
   cd /workspaces/pumpkit
   npm install
   npx turbo build --filter=@pumpkit/web
   ls packages/web/dist/index.html   # must exist
   ```
   Fix any TypeScript or build errors before deploying — Vercel will fail noisily on the same issues.

2. **Install the Vercel CLI** and authenticate:
   ```bash
   npm install -g vercel
   vercel login
   ```

3. **Link the repo** to a Vercel project (run from repo root, accept the existing `vercel.json`):
   ```bash
   vercel link
   ```
   When prompted:
    - Scope: the maintainer's personal scope (or a team scope if it exists)
    - Project name: `pumpkit`
    - Detected framework: keep `null` (we override the build via `vercel.json`)
    - Override existing `buildCommand` / `outputDirectory`: **No** — keep what `vercel.json` already specifies

4. **Configure environment variables** in the Vercel project. The dashboard needs `VITE_API_URL` to leave mock mode (see `packages/web/.env.example`). Set it for the Production environment to point at the live `@pumpkit/monitor` instance (or leave it unset and the dashboard will run in mock mode — fine for the first deploy, just be explicit in the README that the demo is mock):
   ```bash
   vercel env add VITE_API_URL production
   ```

5. **Deploy a preview first** to validate before flipping production:
   ```bash
   vercel
   ```
   Click the preview URL Vercel prints. Confirm the dashboard renders, the mock banner appears (or live data flows if `VITE_API_URL` is set), and the docs pages load (`/docs`, `/packages`, `/create`).

6. **Promote to production**:
   ```bash
   vercel --prod
   ```
   Record the production URL — likely `https://pumpkit.vercel.app` or similar.

7. **Wire the URL into docs**:
   - Add a `[![Deploy](https://img.shields.io/badge/dashboard-live-success)](https://pumpkit.vercel.app)` badge near the top of `README.md`
   - Add a "Live demo" section to `README.md` linking the production URL
   - In `STATUS.md`, remove the "Deploy web dashboard to Vercel" next-step and add a `Web | ✅ Deployed (vercel.app)` row in a new **Deployments** subsection (or extend the CI/CD table)
   - Update `packages/web/README.md` (create if missing) with the live URL + the env-var notes

8. **(Recommended)** Pin Node 20 in Vercel via `engines` already in the root `package.json` (already set to `>=20.0.0`). Confirm in the Vercel project settings that the build node version is 20.

## Verification
```bash
# Production URL is reachable and serves the dashboard
curl -fsSI https://<your-pumpkit>.vercel.app/ | head -1            # HTTP/2 200
curl -fsSL https://<your-pumpkit>.vercel.app/dashboard | grep -q "PumpKit"

# Local build still works for everyone else
cd /workspaces/pumpkit
npx turbo build --filter=@pumpkit/web
```

If Vercel is not yet authorised for this account/repo, stop after step 1 and surface the auth requirement — do not try to brute-force the CLI flow.

## Cleanup
```bash
rm /workspaces/pumpkit/prompts/06-deploy-web-to-vercel.md
```

## Commit and push (as nirholas)
```bash
cd /workspaces/pumpkit
git add README.md STATUS.md packages/web/README.md docs/ prompts/06-deploy-web-to-vercel.md
# Vercel may have created .vercel/project.json — typically gitignored, do not commit it
git -c user.name=nirholas -c user.email=nirholas@users.noreply.github.com commit -m "$(cat <<'MSG'
chore(web): ship @pumpkit/web to Vercel and link from docs

Promotes the dashboard at packages/web to a production Vercel
deployment using the existing vercel.json. Adds a Deploy badge
and a Live demo section to the root README, records the live URL
in STATUS.md, and documents the VITE_API_URL env-var requirement
plus the production deployment URL in packages/web/README.md.

Resolves the STATUS.md next-step to deploy the web dashboard.
MSG
)"
git push
```

If `git push` fails with a 403, leave the commit local and surface the auth error.
