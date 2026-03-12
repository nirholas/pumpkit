# Agent Task 13: Extract REST API + SSE + Webhooks

## Context

We're building **PumpKit** (`/workspaces/pump-fun-sdk/pumpkit/`). Read `pumpkit/docs/core-api.md` and `pumpkit/docs/monitor-bot.md` for the API spec.

The telegram-bot has a full REST API layer with SSE streaming and webhook dispatch. Extract into reusable core modules.

## Source Files to Read

Read ALL files in the API subdirectory:
- `/workspaces/pump-fun-sdk/telegram-bot/src/api/server.ts` — Express HTTP server
- `/workspaces/pump-fun-sdk/telegram-bot/src/api/types.ts` — API types
- `/workspaces/pump-fun-sdk/telegram-bot/src/api/apiStore.ts` — API persistence
- `/workspaces/pump-fun-sdk/telegram-bot/src/api/claimBuffer.ts` — Deduplication
- `/workspaces/pump-fun-sdk/telegram-bot/src/api/rateLimiter.ts` — Rate limiting
- `/workspaces/pump-fun-sdk/telegram-bot/src/api/webhooks.ts` — Webhook dispatch
- `/workspaces/pump-fun-sdk/telegram-bot/src/api/index.ts` — Barrel export

## Task

Create these files under `/workspaces/pump-fun-sdk/pumpkit/packages/core/src/api/`:

### 1. `server.ts`
HTTP server factory:
```typescript
export function createApiServer(options: {
  port: number;
  authToken?: string;
  routes?: (app: http.Server) => void;
}): http.Server;
```
- Use Node.js built-in `http` module (keep it simple, no Express for the framework)
- Bearer token auth middleware if `authToken` is provided
- CORS headers
- JSON body parsing

### 2. `sse.ts`
Server-Sent Events streaming:
```typescript
export class SSEManager {
  addClient(res: http.ServerResponse): void;
  removeClient(res: http.ServerResponse): void;
  broadcast(event: string, data: unknown): void;
}
```

### 3. `webhooks.ts`
Outbound webhook dispatch:
```typescript
export class WebhookManager {
  register(url: string, events?: string[]): string;  // returns id
  unregister(id: string): void;
  dispatch(event: string, data: unknown): Promise<void>;
}
```
- Use native `fetch` for outbound calls
- Retry failed deliveries (3 attempts with backoff)
- Store webhook registrations (via FileStore)

### 4. `rateLimiter.ts`
Per-user/IP rate limiting:
```typescript
export class RateLimiter {
  constructor(options: { windowMs: number; maxRequests: number });
  check(key: string): boolean;  // true = allowed, false = rate limited
}
```

### 5. `index.ts`
Barrel export.

## Requirements

- Use Node.js built-in `http` module — NOT Express (keep core dependency-free)
- Native `fetch` for webhook dispatch
- ES module syntax
- Read the existing telegram-bot API code carefully and preserve its patterns

## Do NOT

- Don't add Express as a dependency
- Don't modify existing bot code
