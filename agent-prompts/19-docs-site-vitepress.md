# Agent Task 19: Set Up Documentation Site with VitePress

## Context

We're building **PumpKit** (`/workspaces/pump-fun-sdk/pumpkit/`). We need a developer documentation site.

Existing docs are in `pumpkit/docs/`:
- `architecture.md`
- `core-api.md`
- `monitor-bot.md`
- `tracker-bot.md`
- `getting-started.md`
- `deployment.md`

## Task

Set up a VitePress documentation site at `/workspaces/pump-fun-sdk/pumpkit/docs-site/`.

### 1. Create `docs-site/package.json`
```json
{
  "name": "@pumpkit/docs",
  "private": true,
  "scripts": {
    "dev": "vitepress dev",
    "build": "vitepress build",
    "preview": "vitepress preview"
  },
  "devDependencies": {
    "vitepress": "^1.5.0"
  }
}
```

### 2. Create `.vitepress/config.ts`
VitePress config with:
- Title: "PumpKit"
- Description: "Open-source framework for building PumpFun Telegram bots"
- Sidebar with sections:
  - **Guide:** Getting Started, Architecture
  - **Packages:** Core API, Monitor Bot, Tracker Bot
  - **Deploy:** Deployment
  - **Community:** Contributing
- Nav bar: Guide, API, GitHub link
- Social links: GitHub repo
- Search enabled

### 3. Create content pages
Copy/symlink the existing docs into the VitePress content structure:

```
docs-site/
├── index.md                    # Landing page (hero + features)
├── guide/
│   ├── getting-started.md      # From pumpkit/docs/getting-started.md
│   └── architecture.md         # From pumpkit/docs/architecture.md
├── packages/
│   ├── core.md                 # From pumpkit/docs/core-api.md
│   ├── monitor.md              # From pumpkit/docs/monitor-bot.md
│   └── tracker.md              # From pumpkit/docs/tracker-bot.md
├── deploy/
│   └── index.md                # From pumpkit/docs/deployment.md
└── contributing.md              # From pumpkit/CONTRIBUTING.md
```

### 4. Create landing page (`index.md`)
VitePress hero layout:
- **Title:** PumpKit
- **Tagline:** Build PumpFun Telegram bots in minutes
- **Actions:** Get Started → /guide/getting-started, GitHub → repo link
- **Features grid:**
  - 🤖 Telegram Bot Framework — grammy-based scaffolding
  - 📡 Real-Time Monitoring — Claims, launches, whales, graduations
  - 🏆 Call Tracking — Leaderboards, PNL cards, rankings
  - 🧱 Modular Core — Use what you need, nothing more
  - 🚀 Production Ready — Docker, Railway, health checks
  - 🔓 Open Source — MIT licensed, community-driven

### 5. Create `docs-site/vercel.json`
For Vercel deployment of the docs site.

## Requirements

- VitePress 1.x (latest stable)
- Copy content from `pumpkit/docs/` into VitePress pages (don't symlink, copy and adjust frontmatter)
- Add VitePress frontmatter to each page (title, description)
- Dark mode enabled (VitePress default)
- Clean URLs (no .html extensions)

## Do NOT

- Don't run `npm install` — just create the files
- Don't modify the original docs in `pumpkit/docs/`
- Don't use Docusaurus, Starlight, or other frameworks — use VitePress
