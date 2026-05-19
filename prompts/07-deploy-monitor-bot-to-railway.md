# Deploy `@pumpkit/monitor` to Railway

## What
`@pumpkit/monitor` is the all-in-one PumpFun monitor bot under `packages/monitor`. It already ships a multi-stage `Dockerfile` and exposes a REST + SSE API on port `3000` (see the `api` / `api:dev` / `dev:full` scripts). Get a production instance running on Railway, connect the dashboard to it via `VITE_API_URL`, and document the deploy so other maintainers can replicate it.

## Where
- Service source: `packages/monitor`
- Dockerfile (already present): `packages/monitor/Dockerfile`
- Per-service README: `packages/monitor/README.md`
- Docs to refresh: `docs/deployment.md` (or `docs/monitor-bot.md`), `STATUS.md`
- New file: `railway.json` at repo root **or** `packages/monitor/railway.json` — choose the per-service variant so the monorepo can host more Railway services later

## Why now
`STATUS.md` lists this as Suggested Next Step #5 and the framework is about to publish to npm. Adopters reading the quick-start need a real REST/SSE endpoint to point the dashboard at — without a deployed reference instance they have to stand one up themselves before the framework feels alive. A hosted reference instance also gives `@pumpkit/web` something to talk to on Vercel (see prompt 06).

## Reference
- `packages/monitor/Dockerfile` — multi-stage Node 20 Alpine image already in place
- `packages/monitor/package.json` scripts:
    - `start` → `node dist/index.js`
    - `api` → `ENABLE_API=true API_ONLY=true tsx src/index.ts` (API-only mode for the dashboard)
    - `dev:full` → `ENABLE_API=true tsx watch src/index.ts` (API + Telegram bot together)
- Railway docs: https://docs.railway.app/deploy/dockerfiles
- Railway monorepo guidance: https://docs.railway.app/guides/monorepo

## Implementation

1. **Verify the Docker build works locally** so we don't debug Railway's build pipeline against a broken Dockerfile:
   ```bash
   cd /workspaces/pumpkit/packages/monitor
   docker build -t pumpkit-monitor:local .
   docker run --rm -e BOT_TOKEN=stub -e RPC_URL=https://api.mainnet-beta.solana.com \
       -p 3000:3000 pumpkit-monitor:local
   # In another shell:
   curl -f http://localhost:3000/api/v1/health
   ```
   The container should report healthy and serve `/api/v1/health` with HTTP 200. Fix any build or runtime errors before pushing to Railway.

2. **Create a `railway.json`** at `packages/monitor/railway.json` so Railway knows which service this is and how to build it:
   ```json
   {
       "$schema": "https://railway.app/railway.schema.json",
       "build": {
           "builder": "DOCKERFILE",
           "dockerfilePath": "packages/monitor/Dockerfile",
           "buildCommand": null
       },
       "deploy": {
           "startCommand": "node dist/index.js",
           "healthcheckPath": "/api/v1/health",
           "healthcheckTimeout": 30,
           "restartPolicyType": "ON_FAILURE",
           "restartPolicyMaxRetries": 10
       }
   }
   ```
   The path is relative to the repo root because Railway clones the whole monorepo.

3. **Create the Railway project** (interactive — requires `railway` CLI auth):
   ```bash
   npm install -g @railway/cli
   railway login
   railway init                # name the project "pumpkit-monitor"
   railway link                # link this checkout to that project
   ```

4. **Configure required environment variables** in the Railway project. The bot reads these (verify the exact names by grepping `packages/monitor/src/config.ts` and `packages/monitor/src/index.ts`):
    - `BOT_TOKEN` — Telegram bot token from BotFather
    - `RPC_URL` — Solana mainnet RPC endpoint (paid provider recommended)
    - `ENABLE_API=true` — turn on the REST/SSE server
    - `PORT=3000` — Railway provides `$PORT`; if the code reads `PORT` use that, otherwise hard-code 3000 here and expose it
    - Any storage paths the bot needs (check `packages/monitor/src/store.ts`)

   Add them via CLI:
   ```bash
   railway variables set BOT_TOKEN=... RPC_URL=... ENABLE_API=true PORT=3000
   ```

5. **Deploy**:
   ```bash
   railway up
   ```
   Watch the logs (`railway logs --service pumpkit-monitor`) until the bot reports `API server listening on :3000` and the Telegram polling loop is up.

6. **Generate a public domain** for the service so the dashboard can reach it:
   ```bash
   railway domain
   ```
   Record the URL (e.g. `https://pumpkit-monitor.up.railway.app`). Verify:
   ```bash
   curl -fsS https://<your-monitor>.up.railway.app/api/v1/health
   ```

7. **Wire the URL into the Vercel-deployed dashboard** (if prompt 06 has already shipped):
   ```bash
   cd /workspaces/pumpkit
   vercel env add VITE_API_URL production    # paste the Railway URL
   vercel --prod                              # redeploy so the URL is baked into the bundle
   ```
   The dashboard should now show the live connection-status pill instead of the mock banner.

8. **Document the deploy**:
   - `packages/monitor/README.md`: add a "Deploying to Railway" section linking the railway.json, listing the required env vars, and giving the `railway up` one-liner
   - `docs/deployment.md` (extend if it exists, otherwise create): one page covering local Docker + Railway + the env-var matrix
   - `STATUS.md`: remove the "Deploy monitor bot to Railway" next-step and add `Monitor | ✅ Deployed (railway.app)` under a new **Deployments** subsection (or extend the CI/CD table)
   - Add `[![Railway](https://img.shields.io/badge/monitor-live-success)](https://<url>)` to the root `README.md`
   - Bump the `STATUS.md` **Last updated** date

## Verification
```bash
# Public URL is healthy
curl -fsS https://<your-monitor>.up.railway.app/api/v1/health

# SSE endpoint streams events (kill after a few seconds with Ctrl-C)
curl -N https://<your-monitor>.up.railway.app/api/v1/claims/stream | head -n 5

# railway.json is valid JSON
node -e "JSON.parse(require('fs').readFileSync('packages/monitor/railway.json','utf8'))"
```

If Railway authentication fails or the maintainer has no Railway account, stop after step 1 (local Docker validation) and surface the auth requirement — do not commit a half-deployed state.

## Cleanup
```bash
rm /workspaces/pumpkit/prompts/07-deploy-monitor-bot-to-railway.md
```

## Commit and push (as nirholas)
```bash
cd /workspaces/pumpkit
git add packages/monitor/railway.json packages/monitor/README.md README.md STATUS.md docs/ prompts/07-deploy-monitor-bot-to-railway.md
git -c user.name=nirholas -c user.email=nirholas@users.noreply.github.com commit -m "$(cat <<'MSG'
chore(monitor): ship @pumpkit/monitor to Railway

Adds packages/monitor/railway.json pinning the Dockerfile build, the
/api/v1/health healthcheck, and an on-failure restart policy.
Deploys the service to Railway, records the public URL in STATUS.md
and the root README, and documents the env-var matrix
(BOT_TOKEN, RPC_URL, ENABLE_API, PORT) in packages/monitor/README.md
plus docs/deployment.md.

Resolves the STATUS.md next-step to deploy the monitor bot and gives
the @pumpkit/web dashboard a stable VITE_API_URL to point at.
MSG
)"
git push
```

If `git push` fails with a 403, leave the commit local and surface the auth error.
