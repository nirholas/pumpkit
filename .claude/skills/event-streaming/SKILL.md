---
name: event-streaming
description: Use this skill any time you're building or debugging realtime event flows in PumpKit — WebSocket subscriptions to pump.fun events, SSE fan-out to clients, decoder pipelines, reconnect-with-replay, multi-provider quorum streams. Triggers on "logsSubscribe", "programSubscribe", "accountSubscribe", "SSE", "event monitor", "websocket dropped events", "channel bot feed". Skip for one-shot reads (use [inspect-curve](../../commands/inspect-curve.md) or `getAccountInfo` directly).
---

# Event streaming for PumpKit

This skill is the project-specific reference for ingesting pump.fun events in realtime and reliably fanning them out to downstream consumers (channel bot, dashboard, claim tracker, analytics).

## The shape of a streaming pipeline

```
┌──────────────┐      ┌────────────────┐      ┌───────────┐      ┌──────────┐
│ Solana RPC   │  WS  │ Resilient WS   │      │ Typed     │      │ Fan-out  │
│ (streamer    ├─────▶│ adapter        ├─────▶│ decoder   ├─────▶│ (SSE /   │
│  pool)       │      │  - heartbeat   │      │  (SDK)    │      │  bot /   │
│              │      │  - reconnect   │      │           │      │  store)  │
└──────────────┘      │  - replay      │      └───────────┘      └──────────┘
                      └────────────────┘
```

Each box has a distinct failure mode and a distinct test surface. Conflate them and you get bugs that only surface in prod.

## Subscription types

| Subscription | Use for | Trade-off |
|---|---|---|
| `logsSubscribe(programId)` | Every event from a program (firehose) | Highest volume; need to filter downstream |
| `programSubscribe(programId, filters)` | Account-change stream filtered server-side | Cheaper, but less flexible than logs |
| `accountSubscribe(pda)` | One account's state changes | Cleanest for tracking a single coin |
| `signatureSubscribe(sig)` | One tx's status changes | One-shot, fires on confirm/finalize/error |

PumpKit's channel and event-monitor packages use `logsSubscribe` for the pump program (firehose) and `accountSubscribe` for specific curves being tracked. The recent `refactor(channel): use typed V2 event decoders` commits moved decode to the SDK — never hand-roll.

## Resilient WebSocket pattern

WebSockets silently die. Cloudflare-fronted endpoints often kill idle sockets at 60s. Your subscriber must:

1. Send a **heartbeat** every ~20s and reconnect on missed pong.
2. **Reconnect to a failover provider** on socket close.
3. **Replay missed events** on reconnect by walking signatures since the last seen slot.
4. **Dedupe by signature** if running quorum mode across providers.

```typescript
export class ResilientLogStream {
  private lastSlot = 0;
  private seen = new Set<string>();  // recent signatures, capped LRU
  private ws?: WebSocket;
  private subId?: number;
  private hbTimer?: NodeJS.Timeout;

  constructor(
    private urls: string[],
    private programId: PublicKey,
    private onLog: (l: { signature: string; slot: number; logs: string[] }) => void,
  ) {}

  start() {
    this.connect(this.urls[0]);
  }

  private connect(url: string) {
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'logsSubscribe',
        params: [{ mentions: [this.programId.toBase58()] }, { commitment: 'confirmed' }],
      }));
      this.hbTimer = setInterval(() => this.heartbeat(), 20_000);
    };
    ws.onmessage = (m) => this.handle(JSON.parse(m.data as string));
    ws.onclose = () => {
      clearInterval(this.hbTimer!);
      const next = this.urls[(this.urls.indexOf(url) + 1) % this.urls.length];
      this.replayMissed().catch(() => {});
      setTimeout(() => this.connect(next), 1_000);
    };
    ws.onerror = () => ws.close();
  }

  private heartbeat() {
    this.ws?.send(JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'getHealth' }));
  }

  private handle(msg: { method?: string; params?: { result?: { value?: { signature?: string; slot?: number; logs?: string[] } } } }) {
    if (msg.method !== 'logsNotification') return;
    const v = msg.params?.result?.value;
    if (!v?.signature || v.slot === undefined || !v.logs) return;
    if (this.seen.has(v.signature)) return;
    this.seen.add(v.signature);
    if (this.seen.size > 5000) {
      // Trim oldest — Set preserves insertion order
      const drop = [...this.seen].slice(0, 1000);
      drop.forEach(s => this.seen.delete(s));
    }
    this.lastSlot = Math.max(this.lastSlot, v.slot);
    this.onLog({ signature: v.signature, slot: v.slot, logs: v.logs });
  }

  private async replayMissed() {
    if (!this.lastSlot) return;
    const conn = new Connection(this.urls[0], 'confirmed');
    const sigs = await conn.getSignaturesForAddress(this.programId, { limit: 200 });
    for (const { signature, slot } of sigs.reverse()) {
      if (slot && slot <= this.lastSlot) continue;
      const tx = await conn.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
      if (!tx || !tx.meta?.logMessages) continue;
      if (this.seen.has(signature)) continue;
      this.seen.add(signature);
      this.onLog({ signature, slot: slot!, logs: tx.meta.logMessages });
    }
  }
}
```

## Decoder pipeline

After ingest, decode with the SDK's typed decoders — never hand-roll byte parsing:

```typescript
import { decodeProgramLogs } from '@nirholas/pump-sdk'; // verify exact export name

monitor.onLog(({ signature, slot, logs }) => {
  const events = decodeProgramLogs(logs);
  for (const event of events) {
    switch (event.type) {
      case 'CreateEvent':            onCreate(event, { signature, slot }); break;
      case 'TradeEvent':             onTrade(event, { signature, slot }); break;
      case 'CollectCreatorFeeEvent': onCreatorFee(event, { signature, slot }); break;
      case 'MigrationEvent':         onMigration(event, { signature, slot }); break;
      // ... etc — V1 vs V2 distinguished by the decoder
    }
  }
});
```

For unrecognised log lines, surface them (don't drop silently) — that's how you learn the SDK is behind on a new event type.

## SSE fan-out

PumpKit's monitor and dashboard use Server-Sent Events to push decoded events to browser clients. Pattern:

```typescript
import express from 'express';
import { EventEmitter } from 'node:events';

const events = new EventEmitter();

app.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const heartbeat = setInterval(() => res.write(': hb\n\n'), 15_000);

  const onEvent = (evt: unknown) => {
    res.write(`data: ${JSON.stringify(evt)}\n\n`);
  };
  events.on('pump', onEvent);

  req.on('close', () => {
    clearInterval(heartbeat);
    events.off('pump', onEvent);
  });
});

// Upstream: emit decoded events
streamMonitor.onTrade(evt => events.emit('pump', { type: 'trade', ...evt }));
```

SSE rules:

- Always emit a heartbeat comment (`: hb\n\n`) — proxies kill silent connections.
- Always serialize on one event channel per stream — clients can't merge multi-source events cleanly.
- Always include a tx signature and slot in every event so clients can dedupe.

## Quorum streaming (for critical feeds)

For events you can't afford to miss (e.g., a claim-tracking bot for fee payouts), run two streamers from independent providers and dedupe downstream:

```typescript
const stream1 = new ResilientLogStream(providerAUrls, PUMP_PROGRAM_ID, dedupe);
const stream2 = new ResilientLogStream(providerBUrls, PUMP_PROGRAM_ID, dedupe);
const seen = new Set<string>();
function dedupe(evt: { signature: string; slot: number; logs: string[] }) {
  if (seen.has(evt.signature)) return;
  seen.add(evt.signature);
  emit(evt);
}
stream1.start(); stream2.start();
```

Cost: 2× the streamer RPC budget. Benefit: a single-provider outage doesn't lose events.

## Observability

Track:

- `events.received_count{source, type}` — by source provider and event type
- `events.decode_failures_count{source}` — log lines the decoder didn't match
- `events.duplicate_count{source}` — quorum dedup hits
- `ws.reconnect_count{source}` and `ws.uptime_seconds{source}` — socket health
- `ws.replayed_events_count{source}` — events recovered via post-reconnect replay
- `sse.connected_clients` and `sse.dropped_count`

Alert on:

- Decode-failure rate spike on any provider (SDK drift or new event type)
- Reconnect rate > 1/min for >5min (provider degraded)
- Replay backlog > 100 events (provider was down long enough to risk gaps)

## Common pitfalls

- **Treating `logsSubscribe` as exactly-once.** It isn't — handle duplicates by signature.
- **No heartbeat → silent socket death.** Cloudflare-fronted endpoints will kill you.
- **Reconnect without replay.** You'll silently miss events while reconnecting.
- **Hand-decoding log lines.** Use the SDK. Always.
- **One subscriber for everything.** Splitting reader/streamer/sender pools is also good practice for streamer count: don't share one provider for both channel bot and dashboard.
- **Unbounded `seen` set memory.** LRU-trim or use a TTL set.

## See also

- [tutorials/29-event-parsing-analytics.md](../../../tutorials/29-event-parsing-analytics.md) — event taxonomy
- [tutorials/43-understanding-pumpfun-events.md](../../../tutorials/43-understanding-pumpfun-events.md) — event types deep dive
- [tutorials/49-rpc-resilience.md](../../../tutorials/49-rpc-resilience.md) — streamer pool design
- [packages/channel/src/](../../../packages/channel/src/) — V2-aware channel bot reference
- [packages/core/src/monitor/](../../../packages/core/src/monitor/) — existing monitors
- [@nirholas/pump-sdk](https://www.npmjs.com/package/@nirholas/pump-sdk) — authoritative decoders
