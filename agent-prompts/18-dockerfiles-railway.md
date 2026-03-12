# Agent Task 18: Create Dockerfiles + Railway Configs

## Context

We're building **PumpKit** (`/workspaces/pump-fun-sdk/pumpkit/`). Read `pumpkit/docs/deployment.md` for the deployment spec.

Both bots need production Docker images and Railway deployment configs.

## Source Files to Read (existing patterns)

- `/workspaces/pump-fun-sdk/telegram-bot/Dockerfile`
- `/workspaces/pump-fun-sdk/channel-bot/Dockerfile`
- `/workspaces/pump-fun-sdk/claim-bot/Dockerfile`
- `/workspaces/pump-fun-sdk/telegram-bot/railway.json`
- `/workspaces/pump-fun-sdk/channel-bot/railway.json`
- `/workspaces/pump-fun-sdk/claim-bot/railway.json`

## Task

### 1. Monitor Bot Dockerfile
Create `/workspaces/pump-fun-sdk/pumpkit/packages/monitor/Dockerfile`:
- Multi-stage build (build + runtime)
- Base: `node:20-alpine`
- Non-root user (bot:bot)
- Copy built output + node_modules + package.json
- Health check: `wget -qO- http://localhost:3000/health`
- Volume mount point: `/app/data`
- CMD: `node dist/index.js`

### 2. Tracker Bot Dockerfile
Create `/workspaces/pump-fun-sdk/pumpkit/packages/tracker/Dockerfile`:
- Same multi-stage pattern
- Include `canvas` native dependency setup (Alpine: `pango cairo jpeg giflib librsvg pixman`)
- Health check on port 3001
- Volume: `/app/data` (for SQLite)

### 3. Railway Configs
Create `railway.json` for both:
- `/workspaces/pump-fun-sdk/pumpkit/packages/monitor/railway.json`
- `/workspaces/pump-fun-sdk/pumpkit/packages/tracker/railway.json`

Schema:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "DOCKERFILE" },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10,
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30
  }
}
```

### 4. Docker Compose
Create `/workspaces/pump-fun-sdk/pumpkit/docker-compose.yml`:
- Both services + named volumes
- env_file references
- Port mappings (3000, 3001)

### 5. `.dockerignore`
Create `/workspaces/pump-fun-sdk/pumpkit/.dockerignore`:
- node_modules, dist, .env, .git, *.md, etc.

## Requirements

- Follow the existing Dockerfile patterns from the source bots
- Alpine-based for small images
- Non-root user for security
- Health checks integrated
- The tracker Dockerfile needs canvas native deps (this is the tricky one — read outsiders-bot if it has a Dockerfile, otherwise handle canvas/Alpine properly)

## Do NOT

- Don't modify existing bot Dockerfiles
- Don't create Kubernetes configs (Railway only)
