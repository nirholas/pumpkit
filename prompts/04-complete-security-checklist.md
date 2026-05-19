# Complete the security checklist in `security/SECURITY_CHECKLIST.md`

## What
`security/SECURITY_CHECKLIST.md` is a comprehensive Solana-key + bot-deployment audit checklist with every item currently unchecked. Walk through the checklist against the actual codebase, mark each item as **verified**, **N/A** (with a one-line reason), or **action-needed** (with a follow-up issue filed), and produce a short audit report at `security/AUDIT-<YYYY-MM-DD>.md` summarising the result. Land any low-risk fixes inline (unused deps, missing zeroization, debug logs that leak secrets); leave anything that needs design discussion as a tracked GitHub issue.

## Where
- Checklist: `security/SECURITY_CHECKLIST.md`
- New audit report: `security/AUDIT-<today's ISO date>.md`
- Source code under audit: every package in `packages/*` plus root-level `tools/`
- Status doc: `STATUS.md` (drop the "Security checklist unchecked" known issue once landed)

## Why now
`STATUS.md` lists this as Known Issue #4 and Suggested Next Step #6. The framework is days away from being published to npm — running the security audit before strangers can `npm install @pumpkit/*` is the right order of operations, and the checklist's **Audit History** table already records a 2026-01-19 pass for the keypair tooling, so the bot/framework half is the missing surface area.

## Reference
- `security/SECURITY_CHECKLIST.md` — the full list of items to walk
- `SECURITY.md` at repo root — disclosure policy and contact info
- Per-package `Dockerfile` and `src/` — the surface area to audit

## Implementation

Walk each section of the checklist in order. For every item, run the listed verification command (or the equivalent grep/inspection), record the result, and either:
- Tick the box in place (`[x]`) when verified
- Replace the box with `(N/A — <reason>)` when the item doesn't apply (e.g., the checklist has Rust-specific items but PumpKit has no Rust)
- Leave the box unchecked and add `→ tracked in issue #<n>` when the work has been deferred

Concrete focus areas:

1. **Secret-key / token exposure** — grep every package for log statements that could leak `BOT_TOKEN`, `RPC_URL` auth keys, or wallet secrets. Patterns to search:
   ```bash
   grep -rn -E 'BOT_TOKEN|PRIVATE_KEY|SECRET|wallet\.secretKey' packages/*/src \
     | grep -vE 'process\.env\.|interface |type |readonly'
   ```
   Any hit that reaches `console.log` / `log.info` is a finding — replace with `[redacted]` or drop the line.

2. **Input validation** — every REST/Telegram entry point in `packages/monitor`, `packages/claim`, `packages/tracker` should reject malformed input before touching storage. Inspect the routes in `packages/monitor/src/api/**` and the bot command handlers for missing length caps, missing base58 validation on wallet inputs, etc.

3. **Output security / file permissions** — anywhere we write a file (storage, logs, generated artifacts) check the mode. Pattern:
   ```bash
   grep -rn -E 'writeFile|writeFileSync|createWriteStream' packages/*/src
   ```
   Sensitive outputs must use `{ mode: 0o600 }`.

4. **Dependencies** — run `npm audit --omit=dev` at the repo root and at each package. Record any moderate-or-higher advisory in the audit report; bump dependencies inline if the fix is a patch-level bump.

5. **Testing** — confirm `npm test` passes 10 times in a row. The checklist explicitly asks for "10+ runs":
   ```bash
   for i in {1..10}; do npm test || { echo "Run $i failed"; break; }; done
   ```

6. **Documentation** — confirm that `SECURITY.md` documents how to report vulnerabilities and that no public file contains real bot tokens, real RPC keys, or real wallet secrets.

Mark the **Rust-specific** items (`cargo audit`, `cargo clippy`, `zeroize`, unsafe blocks, valgrind) as `(N/A — no Rust in this repo)`. The checklist was inherited from the keypair-generation tool; only the parts that apply to the TypeScript framework should be ticked.

**Write the audit report** at `security/AUDIT-<today>.md`. Keep it tight (one page is fine):
- Date, auditor name (`Agent — nirholas`)
- Scope: which packages and which checklist sections were covered
- Summary table: `Section | Items | Verified | N/A | Action-needed`
- Each action-needed item with a one-line description and the GitHub issue link
- Sign-off line + next-audit-due date (suggest +6 months)

Append a new row to the **Audit History** table at the bottom of `SECURITY_CHECKLIST.md`:
```
| <today> | nirholas | TypeScript framework (packages/*) | <PASS or PASS-WITH-FINDINGS> |
```

## Verification
```bash
cd /workspaces/pumpkit

# every grep above must come back clean (no findings) or have a documented fix
# every checked box in SECURITY_CHECKLIST.md must correspond to an artifact:
#   - a passing test run
#   - a passing audit command
#   - an inspected file path with no findings
#   - or a filed issue link

# audit report must exist and be readable
test -f security/AUDIT-*.md && head -1 security/AUDIT-*.md

# build + tests + typecheck must still pass after any inline fixes
npm run build
npm run typecheck
npm test
```

## Cleanup
```bash
rm /workspaces/pumpkit/prompts/04-complete-security-checklist.md
```

## Commit and push (as nirholas)
```bash
cd /workspaces/pumpkit
git add security/ STATUS.md prompts/04-complete-security-checklist.md
# include any source files patched during the audit
git add -u packages
git -c user.name=nirholas -c user.email=nirholas@users.noreply.github.com commit -m "$(cat <<'MSG'
chore(security): walk and sign off the framework security checklist

Reviews security/SECURITY_CHECKLIST.md against every package in
packages/*, marks each item as verified / N/A / action-needed, and
lands the audit report at security/AUDIT-<date>.md. Any low-risk
findings (debug logs that could leak secrets, missing 0600 file
modes, unpinned vulnerable deps) are patched inline; design-level
findings are filed as GitHub issues and linked from the report.

Rust-specific checklist items are explicitly marked N/A — the
framework is TypeScript-only. A new row is appended to the audit
history table covering the TypeScript framework.

Resolves the STATUS.md known issue that the security checklist
was unverified and the matching next-step.
MSG
)"
git push
```

If `git push` fails with a 403, leave the commit local and surface the auth error.
