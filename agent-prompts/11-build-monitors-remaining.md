# Agent Task 11: Build Remaining Monitors (Graduation + Whale + CTO + FeeDist)

## Context

We're building **PumpKit** (`/workspaces/pump-fun-sdk/pumpkit/`). Read `pumpkit/docs/core-api.md` for the monitor API.

Task 10 creates `BaseMonitor`, `ClaimMonitor`, and `LaunchMonitor`. You're building the remaining 4 monitors.

## Source Files to Read

- `/workspaces/pump-fun-sdk/telegram-bot/src/monitor.ts` — Has graduation detection logic
- `/workspaces/pump-fun-sdk/telegram-bot/src/pump-event-monitor.ts` — Event types including whale, CTO
- `/workspaces/pump-fun-sdk/channel-bot/src/event-monitor.ts` — Graduation + whale detection
- `/workspaces/pump-fun-sdk/channel-bot/src/formatters.ts` — See what data each event contains

Also read the BaseMonitor created by task 10 (if it exists):
- `/workspaces/pump-fun-sdk/pumpkit/packages/core/src/monitor/BaseMonitor.ts`

If it doesn't exist yet, create monitors that extend this abstract class:
```typescript
abstract class BaseMonitor {
  abstract start(): void;
  abstract stop(): void;
  status(): MonitorStatus;
}
```

## Task

Create these files under `/workspaces/pump-fun-sdk/pumpkit/packages/core/src/monitor/`:

### 1. `GraduationMonitor.ts`
- Detects bonding curve completion events (token graduates to AMM)
- Monitors the Pump program for "complete" instruction events
- Calls `onGraduation(event: GraduationEvent)` callback

### 2. `WhaleMonitor.ts`
- Detects large buy/sell trades above a configurable SOL threshold
- Monitors Pump program for buy/sell events, filters by amount
- Includes a progress bar calculation (% of bonding curve filled)
- Calls `onWhaleTrade(event: WhaleTradeEvent)` callback

### 3. `CTOMonitor.ts`
- Detects Creator Takeover events (fee recipient changes)
- Monitors for fee redirection instructions
- Calls `onCTO(event: CTOEvent)` callback

### 4. `FeeDistMonitor.ts`
- Detects fee distribution events to shareholders
- Monitors PumpFees program for distribution instructions
- Calls `onFeeDistribution(event: FeeDistEvent)` callback

### 5. Update `index.ts`
Add new monitors to the barrel export.

## Requirements

- Extend `BaseMonitor`
- Import types from `../types/events.ts`
- Import program IDs from `../solana/programs.ts`
- ES module syntax
- Each monitor should support both WebSocket and HTTP polling modes
- Read the existing telegram-bot and channel-bot implementations for the detection logic

## Do NOT

- Don't recreate BaseMonitor, ClaimMonitor, or LaunchMonitor (task 10)
- Don't modify existing bot code
