# Agent Task 23: Write Tests for @pumpkit/core

## Context

We're building **PumpKit** (`/workspaces/pump-fun-sdk/pumpkit/`). Read `pumpkit/docs/core-api.md` for the API spec.

We need unit tests for the core framework modules.

## Task

Create tests under `/workspaces/pump-fun-sdk/pumpkit/packages/core/src/__tests__/`:

### 1. `logger.test.ts`
- Test all log levels (debug, info, warn, error)
- Test LOG_LEVEL filtering
- Test default level is info

### 2. `config.test.ts`
- Test loading required string vars
- Test default values
- Test boolean coercion ('true' → true, 'false' → false)
- Test number coercion  
- Test string[] splitting
- Test missing required var throws error
- Test empty optional var uses default

### 3. `storage.test.ts`
- Test FileStore read/write cycle
- Test FileStore returns defaultValue when file missing
- Test FileStore creates directory if needed
- Test SqliteStore basic operations (if module exists)

### 4. `formatter.test.ts`
- Test link() generates correct HTML
- Test solscanTx/solscanAccount/pumpFunToken generate correct URLs
- Test shortenAddress truncates correctly
- Test formatSol converts lamports to SOL string
- Test bold/code/italic generate correct HTML tags
- Test formatClaim produces valid HTML with all fields

### 5. `health.test.ts`
- Test health server starts and responds to GET /health
- Test response includes status: 'ok' and uptime
- Test custom stats are included in response
- Clean up server after test

### 6. `bot.test.ts`
- Test createBot returns a Bot instance
- Test command registration (mock grammy)

## Setup files needed

### `jest.config.ts` (at packages/core/ level)
```typescript
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
};
```

### Update `packages/core/package.json`
Add to scripts: `"test": "jest"`
Add to devDeps: `jest`, `ts-jest`, `@types/jest`

## Requirements

- Use Jest with ts-jest for ESM
- Each test file should be independent (no shared state)
- Use `describe` / `it` structure
- Mock external dependencies (Solana RPC, Telegram API)
- Test the modules that exist — skip tests for modules that don't exist yet
- Check which modules exist under `pumpkit/packages/core/src/` before writing tests

## Do NOT

- Don't create integration tests that need real RPC connections
- Don't install dependencies
