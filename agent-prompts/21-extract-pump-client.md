# Agent Task 21: Extract Pump Client (RPC Data Fetchers)

## Context

We're building **PumpKit** (`/workspaces/pump-fun-sdk/pumpkit/`). Read `pumpkit/docs/core-api.md`.

Multiple bots have `pump-client.ts` files with RPC calls to fetch token info, prices, reserves, etc.

## Source Files to Read

- `/workspaces/pump-fun-sdk/telegram-bot/src/pump-client.ts`
- `/workspaces/pump-fun-sdk/channel-bot/src/pump-client.ts`
- `/workspaces/pump-fun-sdk/claim-bot/src/pump-client.ts`

## Task

Create `/workspaces/pump-fun-sdk/pumpkit/packages/core/src/solana/pump-client.ts`:

1. Read all 3 pump-client files
2. Merge into a single `PumpClient` class with all unique methods:
   - Token info (name, symbol, URI, creator)
   - Price calculation from bonding curve reserves
   - Fee quote calculation
   - Trade info (volumes, counts)
   - Profile/creator info
   - Bundle detection
3. The client should accept a Solana `Connection` instance

```typescript
export class PumpClient {
  constructor(connection: Connection);
  getTokenInfo(mint: PublicKey): Promise<TokenInfo | null>;
  getTokenPrice(mint: PublicKey): Promise<number>;
  getBondingCurveState(mint: PublicKey): Promise<BondingCurveState | null>;
  // ... other methods found in the source files
}
```

## Requirements

- Uses `@solana/web3.js` Connection
- ES module syntax
- Export relevant types (TokenInfo, BondingCurveState, etc.)
- Merge duplicate methods, keeping the most complete implementation
- Add the export to `solana/index.ts` barrel file

## Do NOT

- Don't modify existing bot code
- Don't duplicate code that already exists in the pump-fun-sdk core (`src/`)
