# Agent Task 20: Create GitHub Actions CI/CD

## Context

We're building **PumpKit** (`/workspaces/pump-fun-sdk/pumpkit/`). We need CI/CD for the monorepo.

## Task

Create GitHub Actions workflows at `/workspaces/pump-fun-sdk/pumpkit/.github/workflows/`:

### 1. `ci.yml` — Continuous Integration
Triggered on: push to `main`, pull requests

Jobs:
- **typecheck** — Run `npm run typecheck` (all packages)
- **lint** — Run `npm run lint` (all packages)
- **test** — Run `npm test` (all packages)
- **build** — Run `npm run build` (all packages)

Matrix: Node.js 20, 22
Cache: npm dependencies
Turborepo remote caching (optional)

### 2. `release.yml` — Package Publishing
Triggered on: GitHub Release published

Jobs:
- Build all packages
- Publish `@pumpkit/core` to npm
- (Monitor and tracker are apps, not published)

### 3. `docs.yml` — Documentation Deploy
Triggered on: push to `main` (changes in `docs-site/`)

Jobs:
- Build VitePress site
- Deploy to Vercel (or GitHub Pages)

### 4. `docker.yml` — Docker Image Build
Triggered on: push to `main`, tags `v*`

Jobs:
- Build monitor bot Docker image
- Build tracker bot Docker image
- Push to GitHub Container Registry (ghcr.io)
- Tag with version + latest

## File Structure

```
pumpkit/.github/
└── workflows/
    ├── ci.yml
    ├── release.yml
    ├── docs.yml
    └── docker.yml
```

## Requirements

- Use latest GitHub Actions (actions/checkout@v4, actions/setup-node@v4)
- npm caching for fast CI
- Turborepo integration for the monorepo
- Docker builds should be multi-platform (linux/amd64, linux/arm64)
- Use GitHub Container Registry (ghcr.io/pumpkit/monitor, ghcr.io/pumpkit/tracker)

## Do NOT

- Don't add secrets or tokens — use `${{ secrets.XXX }}` placeholders
- Don't create deployment configs for Railway (that's manual)
- Don't overengineer — keep workflows simple and maintainable
