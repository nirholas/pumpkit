---
description: Run quick performance checks on a PumpKit monitor / bot — event ingestion rate, RPC latency, memory
argument-hint: [package-name]
---

Run a 60-second performance sanity check on `$ARGUMENTS` (default: `@pumpkit/monitor`).

## Steps

1. **Confirm the package is built:**
   ```bash
   npm run build --workspace="$ARGUMENTS"
   ```
2. **Start the bot with metrics enabled:**
   ```bash
   LOG_LEVEL=info METRICS_ENABLED=1 npm run dev --workspace="$ARGUMENTS" &
   ```
3. **Sample the metrics over 60s** — use `curl http://localhost:3000/metrics` if the health server exposes them, or read stdout.
4. **Measure RPC latency:**
   ```bash
   for i in 1 2 3 4 5; do
     time curl -s -X POST "$SOLANA_RPC_URL" \
       -H 'Content-Type: application/json' \
       -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' > /dev/null
   done
   ```
5. **Report:**
   - Events/sec ingested (decoded)
   - RPC p50 / p95 latency
   - Heap usage (`process.memoryUsage().heapUsed`)
   - Subscription health (any reconnects in the 60s window)
6. **Compare against budgets** (set in [docs/performance.md](../../docs/performance.md) if it exists):
   - Monitor should sustain ≥ 50 events/sec without back-pressure
   - RPC p95 < 500ms
   - Heap should not grow > 50MB during the 60s window

If any budget is missed, point at [.claude/agents/rpc-doctor.md](../agents/rpc-doctor.md) for RPC issues or [tutorials/49-indexing-v2-events.md](../../tutorials/49-indexing-v2-events.md) for ingestion-rate improvements.

## Avoid

- Running this in CI as a hard gate — perf varies by network. Use it for local sanity, not blocking decisions.
- Forgetting to kill the background bot (`kill %1`) after the run.
