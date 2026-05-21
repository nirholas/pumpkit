# Tutorial 49 — RPC resilience: failover, rate limits, and read-vs-write topology

> Audience: anyone running a bot in production. Single-RPC deployments are fragile by default; this tutorial covers the patterns PumpKit uses to stay up when providers degrade.
>
> Companion agent: [.claude/agents/rpc-strategist.md](../.claude/agents/rpc-strategist.md)

A pump.fun bot is dominated by RPC calls. Every event subscription, every account read, every preflight, and every `sendTransaction` is an RPC. When that RPC degrades — rate limits, regional latency spikes, slot lag, transient 5xx — your bot's behaviour degrades **silently** unless you've designed for it.

## The three RPC roles

Treat your RPC topology as **three distinct roles**, not "an RPC URL":

| Role | What it does | Latency target | Failure budget |
|---|---|---|---|
| **Reader** | `getAccountInfo`, `getProgramAccounts`, `getMultipleAccounts` for cold lookups | <250ms p99 | Can tolerate occasional 1-2s spikes |
| **Streamer** | WebSocket `logsSubscribe`, `accountSubscribe`, `programSubscribe` | <100ms event-to-bot | Must reconnect within 2s of disconnect |
| **Sender** | `sendTransaction`, `simulateTransaction`, blockhash-fresh writes | <500ms send acknowledgement | Must succeed at >99.5% on a healthy network |

A single provider rarely excels at all three. Premium endpoints often optimise for sender + streamer, free tiers throttle reader, regional endpoints minimise streamer latency.

## Pattern 1: Health-tracked round-robin reader

Keep a list of reader RPCs. Wrap them in a client that tracks success rate, latency, and slot lag, and prefers the healthiest endpoint per request.

```typescript
interface RpcHealth {
  url: string;
  errorRate: number;       // EWMA, 0..1
  p99LatencyMs: number;
  slotLag: number;         // currentSlot - rpcSlot
  cooldownUntil: number;   // ms epoch
}

export class HealthyReader {
  private health = new Map<string, RpcHealth>();

  constructor(private urls: string[]) {
    for (const url of urls) {
      this.health.set(url, { url, errorRate: 0, p99LatencyMs: 0, slotLag: 0, cooldownUntil: 0 });
    }
  }

  private pick(): string {
    const now = Date.now();
    const eligible = [...this.health.values()].filter(h => h.cooldownUntil < now);
    if (!eligible.length) {
      // Everyone is cooling down — pick the one whose cooldown ends soonest.
      const next = [...this.health.values()].sort((a, b) => a.cooldownUntil - b.cooldownUntil)[0];
      return next.url;
    }
    eligible.sort((a, b) => (a.errorRate - b.errorRate) || (a.p99LatencyMs - b.p99LatencyMs));
    return eligible[0].url;
  }

  async call<T>(fn: (conn: Connection) => Promise<T>, attempts = 3): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      const url = this.pick();
      const h = this.health.get(url)!;
      const t0 = Date.now();
      try {
        const conn = new Connection(url, 'confirmed');
        const result = await fn(conn);
        const dt = Date.now() - t0;
        h.errorRate = 0.9 * h.errorRate;                 // EWMA decay
        h.p99LatencyMs = 0.9 * h.p99LatencyMs + 0.1 * dt;
        return result;
      } catch (e) {
        lastErr = e;
        h.errorRate = 0.9 * h.errorRate + 0.1;           // bump
        if (h.errorRate > 0.5) h.cooldownUntil = Date.now() + 10_000;
      }
    }
    throw lastErr;
  }
}
```

Key choices:

- **EWMA, not raw counters.** A burst of 429s should mark the endpoint sick, but a single old failure shouldn't taint it forever.
- **Cooldowns, not removal.** Providers recover. Keep them in the pool with a backoff.
- **Slot lag as a first-class metric.** A provider may answer fast and wrong. Compare `getSlot()` across providers periodically and quarantine laggers.

## Pattern 2: Subscriber failover with replay

WebSocket subscriptions silently die. Cloudflare-fronted endpoints frequently kill idle sockets at 60s. Your bot needs:

1. A **heartbeat** — send a no-op `getHealth` every 20s and reconnect if no pong in 5s.
2. **Reconnect-with-replay** — when reconnecting, fetch missed transactions for the program since the last seen slot.
3. **Quorum mode** for critical streams — subscribe via two providers, dedupe by signature.

```typescript
export class ResilientLogStream {
  private lastSlot = 0;
  private ws?: WebSocket;
  constructor(
    private urls: string[],
    private programId: PublicKey,
    private onLog: (l: Logs) => void,
  ) {}

  async start() {
    const url = this.urls[0];
    this.connect(url);
    setInterval(() => this.heartbeat(), 20_000);
  }

  private connect(url: string) {
    this.ws = new WebSocket(url);
    this.ws.onopen = () => this.subscribe();
    this.ws.onclose = () => {
      const next = this.urls[(this.urls.indexOf(url) + 1) % this.urls.length];
      setTimeout(() => this.connect(next), 1_000);
      this.replayMissed().catch(() => {});
    };
    this.ws.onmessage = (m) => this.handle(JSON.parse(m.data as string));
  }

  // ... heartbeat / subscribe / handle / replayMissed
}
```

`replayMissed` walks `getSignaturesForAddress(programId, { until: lastSlotSig })` and emits each as a synthetic log. This is what lets your monitor survive a 30-second provider hiccup without dropping events.

## Pattern 3: Sender with preflight, blockhash refresh, and Jito fallback

Sender RPCs fail differently from readers. The usual culprits:

- **Stale blockhash** — silent drop after ~60s.
- **Insufficient priority fee** — landed-eventually or dropped.
- **Provider rate limit** on `sendTransaction` — 429, must retry elsewhere.
- **Account-already-in-use** races — preflight catches this if you let it.

A robust sender:

```typescript
async function sendWithResilience(
  payer: Keypair,
  ix: TransactionInstruction[],
  senders: Connection[],
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const conn = senders[attempt % senders.length];
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('finalized');

    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: payer.publicKey }).add(...ix);
    tx.sign(payer);

    try {
      // Always preflight on attempt 0 to catch obvious failures cheaply.
      const sig = await conn.sendRawTransaction(tx.serialize(), {
        skipPreflight: attempt > 0,
        maxRetries: 0,                      // we drive retry ourselves
      });
      const conf = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      if (!conf.value.err) return sig;
    } catch (e) {
      // 429 / network / blockhash-not-found — try next provider with fresh blockhash
      continue;
    }
  }
  throw new Error('All senders failed');
}
```

Bump the priority fee on each retry — `setComputeUnitPrice(ix, oldPrice * 1.5)` is a sensible curve. If you're still failing after the priority-fee escalation, consider routing the next attempt through a Jito bundle (see [tutorial 48](48-jito-bundle-strategies.md)).

## Provider mix recommendations

A defensible production mix:

- **Reader pool**: 2 paid (different vendors, different regions) + 1 archival/historical RPC for backfill.
- **Streamer pool**: 1 vendor with confirmed websocket SLA, 1 secondary for failover. Don't share with readers — streaming saturates connections.
- **Sender pool**: 2 paid (different vendors) + Jito block engine for bundle sends. The vendors should be in the same region as the cluster leaders if you're competing for slots.

Avoid:

- Public/free RPCs (api.mainnet-beta.solana.com) for anything other than dev. Their rate limits will surprise you in prod.
- Mixing reader/sender/streamer on one URL "to save money". You will pay in incidents.
- Vendor lock-in on RPC URLs hard-coded in code. Use env-driven config (`packages/core/src/solana/rpc.ts` shows the pattern).

## Observability

You can't tune what you can't see. Track:

- `rpc.request_count{role, provider, method}`
- `rpc.error_count{role, provider, code}`
- `rpc.latency_ms{role, provider, method}` (histogram)
- `rpc.slot_lag{provider}` (gauge — compare against the max across the pool)
- `ws.reconnect_count{provider}` and `ws.replayed_events_count{provider}`

Alert on:

- error rate > 5% sustained for 1m on a single provider → quarantine via cooldown
- error rate > 5% across **all** providers for 1m → likely a chain-wide issue, page someone
- slot lag > 30 on the streamer → reconnect immediately

## See also

- [packages/core/src/solana/rpc.ts](../packages/core/src/solana/rpc.ts) — current RPC resolution
- [packages/core/src/health/](../packages/core/src/health/) — existing health surface
- [tutorial 48](48-jito-bundle-strategies.md) — Jito as a sender alternative
- [.claude/agents/rpc-strategist.md](../.claude/agents/rpc-strategist.md) — agent for RPC topology decisions
