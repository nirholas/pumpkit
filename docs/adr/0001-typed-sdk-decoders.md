# ADR 0001 — Use typed SDK decoders over hand-rolled byte parsing

- **Status**: Accepted
- **Date**: 2026-05-21
- **Drivers**: channel bot maintainer, event-monitor owner

## Context

PumpKit ingests a high volume of pump.fun on-chain events through `logsSubscribe`, `accountSubscribe`, and `programSubscribe`. Historically, decoders for these events lived inside `@pumpkit/core`, hand-implemented per event type by reading byte offsets and applying Anchor-style discriminator checks.

Three forces pushed us to reconsider:

1. **V2 instruction rollout (2026-05-21).** USDC-paired coins require V2 `create` / `buy` / `sell`, with different field layouts than V1. Maintaining hand-rolled decoders for *both* V1 and V2, with the discriminator-based selection logic to choose between them, was duplicative and error-prone.
2. **Authoritative decoders exist upstream.** [@nirholas/pump-sdk](https://www.npmjs.com/package/@nirholas/pump-sdk) is the project's protocol SDK and already exports typed `BondingCurveAccount`, `TradeEvent`, `CreateEvent`, etc. with discriminator-aware parsing.
3. **Drift risk.** A change in the on-chain layout (e.g., a new field appended to `TradeEvent`) silently corrupts hand-rolled decoders. Typed SDK decoders fail loudly because the TypeScript types disagree.

## Decision

PumpKit's core, channel, and event-monitor packages **consume typed event/instruction decoders from `@nirholas/pump-sdk`** instead of maintaining local byte-level decoders. The SDK is declared a `peerDependency` of `@pumpkit/core`, and consumers install it explicitly.

Concretely:

- `packages/core/src/` no longer contains hand-rolled `decodeTradeEvent`, `decodeCreateEvent`, or `decodeBondingCurve` functions. Where local types are required (e.g., for SSE serialisation), they import the SDK types and re-export them.
- The `channel` and `event-monitor` packages were refactored onto SDK V2 decoders in commits `1bfec69` and `54768bc`.
- Discriminator-based V1-vs-V2 selection lives in the SDK; PumpKit code receives a tagged union and matches on it.

## Consequences

**Positive:**

- One source of truth for event layouts. SDK bump → all consumers get the update.
- TypeScript flags layout mismatches at compile time.
- V1 vs V2 differences are handled by the SDK; PumpKit code stays simple.
- New event types (e.g., `CollectCreatorFeeEvent`) become available across PumpKit as soon as the SDK adds them.

**Negative:**

- A peer-dep means consumers must install `@nirholas/pump-sdk` themselves; a missing install fails at runtime, not at `npm install`.
- SDK bumps can be breaking. Major versions need a coordinated PR across packages.
- If the SDK is behind on a new event type, PumpKit can't decode it until the SDK ships. Mitigation: pass-through unknown logs to consumers as raw `Program log:` lines so nothing is silently dropped.

**Future obligations:**

- Track the SDK's minimum required version in [CLAUDE.md](../../CLAUDE.md) and in each package's `package.json` peer-dep range.
- Any time a new pump.fun instruction or event ships on chain, check the SDK before considering a local decoder.

## Considered alternatives

### A. Keep hand-rolled decoders in `@pumpkit/core`

Familiar, no peer-dep. But: every layout change risks silent corruption, V1/V2 selection logic is repeated, and adding new event types means rebuilding the decoder from a spec.

**Rejected.** The maintenance cost grew faster than the value of "owning" the decoders.

### B. Vendor the SDK source into `@pumpkit/core`

We could copy the SDK's decoders into PumpKit and remove the peer-dep.

**Rejected.** Vendoring loses upstream updates and creates a divergence we'd have to manually merge. The peer-dep model gives us the same code with automatic upstream sync.

### C. Generate decoders from an IDL at build time

Anchor IDLs can drive code generation. PumpKit could ship a build step that regenerates decoders from a checked-in IDL.

**Rejected for now.** The SDK already does this upstream; doing it again in PumpKit is duplicative. We could revisit if the SDK drifts from the IDL.

## See also

- [@nirholas/pump-sdk](https://www.npmjs.com/package/@nirholas/pump-sdk)
- Commits: `1bfec69`, `54768bc`
- [.claude/agents/pump-event-decoder.md](../../.claude/agents/pump-event-decoder.md)
