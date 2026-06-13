---
description: Smoke-test a monitor end-to-end — start it, watch for the first event, kill it, report
argument-hint: [monitor-class] (default: LaunchMonitor)
---

Quick sanity that the named monitor wires up correctly against the configured RPC and produces at least one event.

## Steps

1. **Verify RPC is reachable:**
   ```bash
   curl -s -X POST "$SOLANA_RPC_URL" -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' | jq .result
   ```
2. **Start the bot** with a 90-second timeout:
   ```bash
   timeout 90 npm run dev --workspace=@pumpkit/monitor 2>&1 | tee /tmp/smoke.log &
   ```
3. **Watch the log** for the first decoded event. Pump.fun has launches every few minutes, so 60–90s is usually enough on mainnet.
4. **After timeout (or first event):**
   - Confirm at least one decoded event was logged.
   - Confirm no `error` lines that look like RPC or decoder failures.
5. **Report:**
   - First event timestamp + signature
   - Total events in the window
   - Any warnings / errors

## Failure modes

| Symptom | Likely cause |
|---|---|
| No events in 90s on mainnet | Check `PUMP_PROGRAM_ID` constant; check RPC reachability |
| `decode failed` repeatedly | SDK version mismatch with on-chain program; bump `@nirholas/pump-sdk` |
| `connection closed` | Public RPC dropped you; switch to paid RPC |
| Health endpoint 503 | Monitor crashed on first event — check stdout |

For RPC-specific issues, escalate to the [rpc-doctor](../agents/rpc-doctor.md) agent.

## Avoid

- Treating "no events in 30s" as a failure — pump.fun has quiet minutes. Use 60–90s.
- Running against devnet and expecting mainnet-rate events. Devnet pump activity is sporadic.
