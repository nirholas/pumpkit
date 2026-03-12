# Agent Task 24: Create Monitor Bot Integrations (Twitter + GitHub + Groq)

## Context

We're building **PumpKit** (`/workspaces/pump-fun-sdk/pumpkit/`). Read `pumpkit/docs/monitor-bot.md` for the integration spec.

The Monitor Bot has optional social integrations that enrich notifications with external data.

## Source Files to Read

- `/workspaces/pump-fun-sdk/claim-bot/src/twitter-client.ts` — Twitter follower tracking
- `/workspaces/pump-fun-sdk/channel-bot/src/x-client.ts` — X/Twitter handle lookup
- `/workspaces/pump-fun-sdk/channel-bot/src/github-client.ts` — GitHub social fees
- `/workspaces/pump-fun-sdk/channel-bot/src/social-fee-index.ts` — Social fee mapping
- `/workspaces/pump-fun-sdk/channel-bot/src/groq-client.ts` — LLM summarization

## Task

Create these files under `/workspaces/pump-fun-sdk/pumpkit/packages/monitor/src/integrations/`:

### 1. `twitter.ts`
Merge both Twitter clients into one:
- Look up X handles for token creators
- Get follower counts
- Check if influencers follow the creator
- Uses native `fetch` (Node 20+)
- Graceful degradation if TWITTER_BEARER_TOKEN not set

### 2. `github.ts`
Social fee PDA lookup via GitHub:
- Look up social fee configurations
- Map tokens to GitHub profiles
- Graceful degradation if GITHUB_TOKEN not set

### 3. `groq.ts`
Optional LLM summarization:
- Summarize token descriptions using Groq API
- Rate limited (the Groq free tier is limited)
- Graceful degradation if GROQ_API_KEY not set

### 4. `index.ts`
Barrel export.

## Requirements

- Read the existing implementations carefully — they have proven API patterns
- All integrations must be strictly optional (no crashes if keys missing)
- Use native `fetch` — no axios
- ES module syntax
- Each client should log when it's disabled (missing token)

## Do NOT

- Don't add external HTTP libraries
- Don't modify existing bot code
