# Wallet & Keypair Safety

A practical guide for builders working with Solana keypairs inside PumpKit
projects. Read this before you commit anything that touches `tmp/`,
`scripts/`, or anywhere else a keypair might live.

The short version: **a Solana keypair file is a bearer credential.** Anyone
holding the 64-byte secret can sign transactions and drain the wallet. Treat
it like a production database password, not a config file.

---

## What a Solana keypair looks like

The default `solana-keygen` output is a JSON array of 64 unsigned bytes:

```json
[12, 34, 56, ..., 211, 7, 88]
```

That's it. No envelope, no obvious "this is a secret" header. If you see a
229-byte JSON file with 64 integers in `tmp/` or `scripts/`, assume it's a
keypair until proven otherwise.

Common file names to watch for:

| Pattern                      | Likely contents                                  |
| ---------------------------- | ------------------------------------------------ |
| `funder.json`                | Funding wallet for distributing SOL              |
| `mint.json`                  | Mint authority / token mint keypair              |
| `*.keypair.json`             | Generic per-purpose wallet                       |
| `id.json`                    | Default `solana-cli` wallet (`~/.config/solana`) |
| Base58-pubkey-named `*.json` | Vanity address keypairs                          |

---

## Rule 1 — Never commit a keypair file

The repo's `.gitignore` is the first line of defense. PumpKit already ignores
several keypair patterns under `tmp/`:

```gitignore
tmp/leaked-launch/funder.json
tmp/leaked-launch/mint.json
tmp/leaked-launch/*.keypair.json
tmp/vanity-usdc/*.json
```

When adding a new script directory, **always** add a matching `.gitignore`
entry **before** you generate the keypair, not after. Once a keypair lands in
a commit, it's permanently part of git history — even a force-push doesn't
purge it from forks, CI logs, or third-party mirrors.

A safer pattern: keep keypairs out of the repo tree entirely.

```bash
mkdir -p ~/.pumpkit-secrets/my-launch
solana-keygen new -o ~/.pumpkit-secrets/my-launch/funder.json
```

Reference them by absolute path from your scripts. They cannot be committed
because they don't live inside the working tree.

---

## Rule 2 — Prefer env vars for production

For deployed bots, load the secret key from an environment variable, not a
file:

```typescript
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

function loadSignerFromEnv(name: string): Keypair {
  const raw = process.env[name];
  if (!raw) throw new Error(`Missing env var: ${name}`);

  // Accept either base58 string or JSON byte array
  if (raw.startsWith('[')) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  }
  return Keypair.fromSecretKey(bs58.decode(raw));
}
```

Store the value in your hosting provider's secret manager (Railway, Vercel,
Doppler, Fly secrets, etc.) — not in `.env` files committed to the repo. The
PumpKit `.gitignore` covers `.env` and `.env.*` by default, but a sloppy
`git add -f` will bypass it.

---

## Rule 3 — Separate hot wallets from cold storage

For automated bots:

- **Hot wallet** (the one your bot signs with) — funded with only the SOL it
  needs for ~24 hours of operation. Treat it as disposable.
- **Cold wallet** — holds the bulk of funds. Never touches the bot host.
  Funds the hot wallet via manual transfers or a separately-secured drip
  script.

If the hot wallet leaks, you lose a day of operating capital, not the whole
treasury.

---

## Rule 4 — Audit before you push

Before every push, run:

```bash
git diff --cached --name-only | xargs -I {} sh -c \
  'head -c 5 "{}" | grep -q "^\[" && echo "POTENTIAL KEYPAIR: {}"'
```

Or use the included `tools/lint-check.mjs` (see `packages/*/package.json`
`lint` scripts), which flags any staged JSON file that looks like a
64-element integer array.

For an existing repo, scan history with [`gitleaks`](https://github.com/gitleaks/gitleaks)
or [`trufflehog`](https://github.com/trufflesecurity/trufflehog):

```bash
gitleaks detect --source . --no-banner
trufflehog git file://.
```

Both will flag base58 secret keys, mnemonic phrases, and common API key
patterns.

---

## Rule 5 — If a key leaks, treat it as compromised immediately

A leaked keypair cannot be "unleaked." Recovery procedure:

1. **Move the funds** — sign a transfer from the leaked wallet to a freshly
   generated one. Do this from the same host that has the key in memory; do
   not re-import it elsewhere first.
2. **Revoke any delegated authorities** — if the wallet was a mint authority,
   metadata authority, or freeze authority, transfer that role to a new key
   or set it to `null` if appropriate.
3. **Rotate downstream secrets** — anything the leaked wallet had access to
   (program upgrade authority, multisig membership, fee-share PDAs) needs
   manual review.
4. **Purge from git history** — use `git filter-repo` to remove the file
   from history, then force-push. Coordinate with collaborators: their
   clones still contain the secret.
5. **Notify the team** — assume the key is in someone else's hands. Don't
   wait to see if funds get drained.

---

## Rule 6 — Don't paste keys into chat tools

Including AI assistants, Slack, Discord, GitHub issues, screen recordings,
or screenshots. Chat transcripts get logged, cached, mirrored, and
indexed. A "private" DM is private from other users, not from the platform
operator or future security incidents.

If you need to share a key with a collaborator, use a dedicated secret-sharing
tool (1Password, Bitwarden Send, age-encrypted file, etc.) with a short
expiry.

---

## Quick checklist

Before pushing any commit that touches scripts, tools, or `tmp/`:

- [ ] No `*.json` files staged that contain a 64-element integer array
- [ ] No `.env`, `.env.local`, `.env.production`, or similar staged
- [ ] No base58 strings 87–88 chars long in any diff (likely a secret key)
- [ ] No mnemonic phrases (12 / 24 lowercase words) in any diff
- [ ] No RPC URLs with embedded API keys in any diff
- [ ] No Telegram bot tokens (`\d{9,10}:[A-Za-z0-9_-]{35}`) in any diff
- [ ] No GitHub PATs (`github_pat_…`, `ghp_…`, `ghs_…`) in any diff

If anything on this list shows up in `git diff --cached`, **stop and fix it
before pushing.**
