# Agent Task 12: Extract Social Integrations (Twitter + GitHub)

## Context

We're building **PumpKit** (`/workspaces/pump-fun-sdk/pumpkit/`). Read `pumpkit/docs/core-api.md` for social API.

Two bots have social media integrations — extract them into reusable clients.

## Source Files to Read

- `/workspaces/pump-fun-sdk/claim-bot/src/twitter-client.ts` — Twitter/X v2 API
- `/workspaces/pump-fun-sdk/channel-bot/src/x-client.ts` — X/Twitter integration
- `/workspaces/pump-fun-sdk/channel-bot/src/github-client.ts` — GitHub API for social fees
- `/workspaces/pump-fun-sdk/channel-bot/src/social-fee-index.ts` — Social fee PDA mapping

## Task

Create these files under `/workspaces/pump-fun-sdk/pumpkit/packages/core/src/social/`:

### 1. `twitter.ts`
Merge the Twitter clients from claim-bot and channel-bot:
```typescript
export class TwitterClient {
  constructor(options: { bearerToken: string });
  getUserInfo(handle: string): Promise<{ followers: number; following: number; name: string; }>;
  checkInfluencerFollows(handle: string, influencerIds: string[]): Promise<string[]>;
}
```

### 2. `github.ts`
GitHub client for social fee lookups:
```typescript
export class GitHubClient {
  constructor(options: { token?: string });
  lookupSocialFee(mint: string): Promise<SocialFeeInfo | null>;
}
```

### 3. `types.ts`
Social integration types.

### 4. `index.ts`
Barrel export.

## Requirements

- Use native `fetch` (Node.js 20+ built-in) — no axios or node-fetch
- ES module syntax
- Handle rate limiting gracefully (Twitter API has strict limits)
- Both clients should be optional — don't crash if tokens aren't configured
- Read the existing implementations and merge the best of both

## Do NOT

- Don't modify existing bot code
- Don't add HTTP client libraries
