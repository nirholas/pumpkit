---
description: Generate a Solana vanity keypair via tools/generate-vanity.sh with safe defaults
argument-hint: <prefix> [--suffix <s>] [--count <n>] [--ignore-case]
---

Run the project's vanity wrapper. **Do not call `solana-keygen` directly** — the wrapper enforces mode-600 perms, validates Base58 input, and writes to a per-label directory under `tmp/`.

## Steps

1. Parse `$ARGUMENTS` into a prefix and any optional flags. If no prefix is given, ask which prefix the user wants (and whether they need a `pump` suffix for pump.fun launches).
2. Estimate time before launching: at ~1M keys/sec/core, expected attempts ≈ `58 ^ len`. Tell the user the estimate so they can decide whether to background it.
3. Run:
   ```bash
   mkdir -p tmp/vanity-<label>
   cd tmp/vanity-<label>
   bash tools/generate-vanity.sh <args>
   ```
   For long grinds (>30s estimated) launch with `run_in_background: true` and wait for the harness notification — do not poll.
4. After it lands, verify with `solana-keygen pubkey <file>` and confirm permissions are `600`.
5. Report the pubkey + keypair path. Remind the user: the keypair is on their machine, never commit it, no need to "send" anything anywhere.

## Pump.fun convention reminder

The launch mint typically ends in `pump`. If the user asked for a prefix only and is planning a pump.fun launch, flag that they may also want `--suffix pump` — or that pump.fun's launch instruction may reject non-`pump`-suffixed mints. Cross-check against [tutorials/13-vanity-addresses.md](tutorials/13-vanity-addresses.md).
