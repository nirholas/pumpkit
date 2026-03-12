# Agent Task 14: Build Core Package Barrel Export + Index

## Context

We're building **PumpKit** (`/workspaces/pump-fun-sdk/pumpkit/`). Other agents are building individual core modules. Your job is to create the main barrel export that ties everything together.

## Task

Create `/workspaces/pump-fun-sdk/pumpkit/packages/core/src/index.ts` — the main entry point for `@pumpkit/core`.

### Steps

1. First, check which modules already exist under `pumpkit/packages/core/src/`. List the directories.

2. For each module that exists, add a re-export. For modules that don't exist yet, add a commented placeholder.

3. The expected module structure (from `pumpkit/docs/architecture.md`):

```typescript
// Bot scaffolding
export { createBot, setupShutdown } from './bot/index.js';
export type { BotOptions, CommandHandler } from './bot/index.js';

// Monitors
export { BaseMonitor, ClaimMonitor, LaunchMonitor, GraduationMonitor, WhaleMonitor, CTOMonitor, FeeDistMonitor } from './monitor/index.js';
export type { MonitorStatus } from './monitor/index.js';

// Solana
export { PUMP_PROGRAM_ID, PUMP_AMM_PROGRAM_ID, PUMP_FEE_PROGRAM_ID, PUMPFUN_FEE_ACCOUNT } from './solana/index.js';
export { createRpcConnection, deriveWsUrl } from './solana/index.js';
export { decodePumpLogs } from './solana/index.js';

// Formatters
export { formatClaim, formatLaunch, formatGraduation, formatWhaleTrade, formatCTO, formatFeeDistribution } from './formatter/index.js';
export { link, solscanTx, solscanAccount, pumpFunToken, shortenAddress, formatSol, bold, code } from './formatter/index.js';

// Storage
export { FileStore, SqliteStore } from './storage/index.js';
export type { Store } from './storage/index.js';

// Config
export { loadConfig } from './config/index.js';

// Health
export { createHealthServer } from './health/index.js';

// Logger
export { log } from './logger/index.js';

// API
export { createApiServer, SSEManager, WebhookManager, RateLimiter } from './api/index.js';

// Social
export { TwitterClient, GitHubClient } from './social/index.js';

// Types
export type { ClaimEvent, LaunchEvent, GraduationEvent, WhaleTradeEvent, CTOEvent, FeeDistEvent, PumpEvent } from './types/index.js';
```

4. Only export modules that actually exist. Comment out the rest with `// TODO: uncomment when module is ready`.

## Requirements

- ES module syntax
- Use `.js` extensions in import paths (required for Node16 module resolution)
- Separate `export` and `export type` correctly
- Check what actually exists before writing the file

## Do NOT

- Don't create stub implementations for missing modules
- Don't modify other module files
