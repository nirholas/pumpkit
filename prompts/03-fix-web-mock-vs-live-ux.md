# Fix the `@pumpkit/web` dashboard's mock-vs-live data UX

## What
The dashboard at `packages/web` falls back to mock data whenever `VITE_API_URL` is unset or the monitor bot is unreachable. This is currently invisible to the user — the feed looks live even when nothing is hitting the wire. Make the data-source state explicit: an in-page banner when the feed is in mock mode, a connection-status pill that surfaces SSE state in plain language, and a clear `.env.example` walkthrough so first-time users know how to point the dashboard at a real `@pumpkit/monitor` instance.

## Where
- Repo: `/workspaces/pumpkit`
- Main package: `packages/web`
- Files to touch (verify paths exist before editing):
    - `packages/web/.env.example` — already exists, expand it
    - `packages/web/src/hooks/useEventStream.ts` — exposes `status: 'connected' | 'connecting' | 'disconnected'`
    - `packages/web/src/pages/Dashboard.tsx` — surface the banner + pill here
    - `packages/web/src/lib/api.ts` and `packages/web/src/lib/types.ts` — add a small `getDataSource()` helper if it makes the UI cleaner
    - `STATUS.md` — drop the known issue once landed
- New (optional) doc: `docs/web-dashboard.md` documenting the env-var + deployment notes

## Why now
`STATUS.md` lists this as Known Issue #3: *"Web dashboard uses mock data by default — set `VITE_API_URL` env to connect to real monitor bot."* The dashboard is otherwise built and we are about to publish packages — first-run users will install the framework, open the dashboard, and assume it's wired up. A clear mock-mode banner prevents that confusion.

## Reference
- Existing connection-status enum lives in [packages/web/src/hooks/useEventStream.ts](packages/web/src/hooks/useEventStream.ts) — reuse it
- `import.meta.env.VITE_API_URL` is read in the same file; a missing value falls back to an empty base URL, which becomes `/api/v1/claims/stream` on the same origin
- Current `.env.example`:
  ```
  VITE_API_URL=http://localhost:3000
  ```

## Implementation

1. **Define a single source of truth for data-source mode.** Add a small helper alongside the API client, e.g. `packages/web/src/lib/api.ts`:
   ```ts
   export type DataSource = 'mock' | 'live';
   export function getDataSource(): DataSource {
       const url = import.meta.env.VITE_API_URL;
       return url && url.length > 0 ? 'live' : 'mock';
   }
   export function getApiBase(): string {
       return import.meta.env.VITE_API_URL ?? '';
   }
   ```
   Wire `useEventStream` to use `getApiBase()` instead of reading `import.meta.env` directly so the helper is the only place that branches on the env var.

2. **Render a banner on `Dashboard.tsx` when `getDataSource() === 'mock'`.** Keep it dismissible per-session via `sessionStorage`, but make the copy specific:
   > Showing simulated events. To stream real data, set `VITE_API_URL` to your `@pumpkit/monitor` REST endpoint and rebuild.

   Use existing Tailwind tokens (`bg-zinc-800`, `text-pump-orange`, etc.) so it matches the dashboard chrome. Place it above the filter bar so it's the first thing visible.

3. **Add a connection-status pill** in the dashboard header that reflects `useEventStream().status`:
    - `connected` → green dot + "Live"
    - `connecting` → amber dot + "Connecting…"
    - `disconnected` → red dot + "Reconnecting…" with a tooltip explaining the auto-backoff
   When `getDataSource() === 'mock'`, render a neutral "Mock" pill instead and skip the SSE state entirely (the SSE hook should not even be started in mock mode — bail out early so we're not spamming a non-existent endpoint).

4. **Expand `packages/web/.env.example`** with concrete pointers:
   ```
   # @pumpkit/web environment
   # Copy this file to .env.local for local dev, or set these as env vars in
   # your hosting provider (Vercel, Netlify, etc.).

   # Required to leave mock mode. Point at the REST/SSE endpoint of a running
   # @pumpkit/monitor instance — see docs/monitor-bot.md for deployment.
   #
   # Local dev (monitor running on the same machine):
   #   VITE_API_URL=http://localhost:3000
   #
   # Production (monitor deployed elsewhere):
   #   VITE_API_URL=https://monitor.your-domain.com
   VITE_API_URL=
   ```

5. **Add `docs/web-dashboard.md`** (or extend `docs/deployment.md` if it covers web) with a short "Connecting to a monitor bot" section. Document:
    - That mock mode is the default
    - How to set `VITE_API_URL`
    - Which endpoints the dashboard expects (`GET /api/v1/health`, `GET /api/v1/claims/stream` SSE)
    - That CORS must allow the dashboard origin

6. **Update `STATUS.md`**:
    - Remove Known Issue #3 ("Web dashboard uses mock data by default")
    - In the **Web Dashboard Pages** table, flip Dashboard from `✅ Built` to `✅ Built + mock-mode UX`
    - Bump the **Last updated** date to today

## Verification
```bash
cd /workspaces/pumpkit/packages/web

# Mock mode — no env var
unset VITE_API_URL
npm run dev   # open http://localhost:5173/dashboard — banner must say "Showing simulated events"; pill shows "Mock"

# Live mode — env var set to a non-existent server
VITE_API_URL=http://localhost:9999 npm run dev
# Pill shows "Reconnecting…" after the EventSource error fires. No mock banner.

# Live mode — env var set to a real monitor
# (run `npm run api` in packages/monitor first)
VITE_API_URL=http://localhost:3000 npm run dev
# Pill shows "Live" once SSE connects. Events stream in.

# Type check + build must stay green
cd /workspaces/pumpkit
npm run typecheck
npm run build
```

## Cleanup
```bash
rm /workspaces/pumpkit/prompts/03-fix-web-mock-vs-live-ux.md
```

## Commit and push (as nirholas)
```bash
cd /workspaces/pumpkit
git add packages/web STATUS.md docs/ prompts/03-fix-web-mock-vs-live-ux.md
git -c user.name=nirholas -c user.email=nirholas@users.noreply.github.com commit -m "$(cat <<'MSG'
feat(web): surface mock-vs-live data source explicitly in the dashboard

Adds a getDataSource()/getApiBase() helper, a dismissible "Showing
simulated events" banner above the filter bar, and a connection-status
pill in the dashboard header that distinguishes Mock / Connecting /
Live / Reconnecting. The SSE hook is no longer started in mock mode.

.env.example is expanded with concrete URLs for local and production
setups, and docs/web-dashboard.md documents the required monitor-bot
endpoints (/api/v1/health, /api/v1/claims/stream) plus CORS guidance.

Resolves the STATUS.md known issue that the dashboard silently falls
back to mock data when VITE_API_URL is unset.
MSG
)"
git push
```

If `git push` fails with a 403, leave the commit local and surface the auth error.
