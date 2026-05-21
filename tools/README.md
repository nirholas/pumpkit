# Tools

Audit and verification utilities for maintaining project security and dependency health.

## Tools

### `audit-dependencies.sh`

Audits all project dependencies for known vulnerabilities across all package managers.

```bash
bash tools/audit-dependencies.sh
```

Checks npm (`npm audit`), Cargo (`cargo audit`), and reports pass/fail/warn for each.

### `check-file-permissions.sh`

Verifies that all keypair JSON files have correct permissions (`0600` — owner read/write only).

```bash
bash tools/check-file-permissions.sh           # Scans project root
bash tools/check-file-permissions.sh ./keys     # Scans specific directory
```

Finds all `*.json` keypair files and flags any with overly permissive access.

### `verify-keypair.ts`

TypeScript keypair verification utility. Validates that a Solana keypair file contains a valid key pair and that the public key matches the expected address.

```bash
npx tsx tools/verify-keypair.ts ./path/to/keypair.json
```

### `lint-check.mjs`

Lightweight repo-wide lint that complements `tsc --noEmit`. Zero dependencies, runs on Node 20+, and catches the failure modes that have actually shown up in this repo:

- Staged JSON files that look like Solana keypairs (64-byte integer arrays under `tmp/`, `secrets/`, or `scripts/`)
- Hardcoded GitHub PATs, Telegram bot tokens, AWS access keys
- `console.log` in `src/` (warning — use the logger instead)
- `.only` / `fdescribe` left in test files (error — would skip sibling tests in CI)
- Bare `// TODO` / `// FIXME` comments with no owner

```bash
node tools/lint-check.mjs            # Lint the whole repo
node tools/lint-check.mjs packages/core   # Lint a specific package

# Or via the workspace lint task:
npx turbo run lint
```

Each package's `package.json` exposes a `lint` script that delegates here, so `turbo run lint` picks them up automatically.

## When To Use

- **Before deployment** — run `audit-dependencies.sh` to catch vulnerable packages
- **After key generation** — run `check-file-permissions.sh` to verify file security
- **CI/CD pipelines** — integrate all three as pre-deploy checks
