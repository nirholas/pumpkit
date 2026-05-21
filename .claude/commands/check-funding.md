---
description: Check whether a Solana address was seeded by pump.fun (uses tools/check-pump-funding.ts)
argument-hint: <pubkey-or-keypair-path>
---

Use the project's funding-source helper to determine if an address was funded by pump.fun's funding wallet. Useful for flagging deployer wallets or confirming a leaked-launch address.

## Steps

1. Parse `$ARGUMENTS`. Accept either a pubkey (base58) or a keypair file path. If a file path, derive the pubkey with `solana-keygen pubkey <file>`.
2. Run:
   ```bash
   npx tsx tools/check-pump-funding.ts <pubkey>
   ```
3. Report the verdict (seeded-by-pump: yes/no), the funding tx signature, and the funding amount when available.
4. If the user is investigating a leaked launch, also point them at [tmp/leaked-launch/](tmp/leaked-launch/) (gitignored) for the local scratch workflow.

## Avoid

- Don't query mainnet without an RPC URL set — read [packages/core/src/solana/rpc.ts](packages/core/src/solana/rpc.ts) for how the helper resolves its RPC.
- Don't confuse "seeded by pump funding wallet" with "created via pump.fun" — these are distinct claims.
