---
description: Verify a Solana keypair file is valid and pubkey matches the expected address
argument-hint: <path-to-keypair.json>
---

Run the project's keypair verifier and the permission check together.

## Steps

1. If `$ARGUMENTS` is empty, ask the user for the keypair path.
2. Confirm the file exists and refuse to print its contents.
3. Run in parallel:
   ```bash
   npx tsx tools/verify-keypair.ts "$ARGUMENTS"
   bash tools/check-file-permissions.sh "$(dirname "$ARGUMENTS")"
   ```
4. Report:
   - Whether the pubkey matches the filename (vanity keypairs encode the pubkey in the filename by convention).
   - Whether the file has mode `600`. If not, suggest `chmod 600 "$ARGUMENTS"` but do not auto-run it.
   - Any other files in the directory with permissive modes.

## Avoid

- Never `cat` the keypair JSON.
- Never echo the secret-key array to chat.
