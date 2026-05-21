---
description: Trace a Jito bundle's landing status across the block engine and the cluster. Reports which txs landed, in which slot, and the tip actually paid.
argument-hint: <bundle-id-or-signature>
---

Diagnose a Jito bundle send — did it land, in which slot, what tip did the searcher pay, and which txs were included. Built around the bundle workflow from [tutorials/48-jito-bundle-strategies.md](../../tutorials/48-jito-bundle-strategies.md).

## Steps

1. Parse `$ARGUMENTS`. Accept either:
   - A **bundle ID** (base58, ~88 chars, returned by `searcherClient.sendBundle`)
   - A **transaction signature** known to be inside a bundle (we'll walk back to the bundle)
2. Resolve the block engine URL the project uses (env var, typically `JITO_BLOCK_ENGINE_URL`).
3. Query the block engine's `getBundleStatuses` for the bundle ID. If only a signature was given, query the equivalent reverse-lookup endpoint or fall back to step 4.
4. Cross-check with the cluster RPC: `getSignatureStatuses` on each tx the bundle was supposed to contain.
5. Report:
   - **Landed**: yes/no
   - **Landing slot** (if landed)
   - **Confirmation status** per tx (`confirmed` / `finalized` / `failed` / `dropped`)
   - **Tip account credited** and **tip amount** (extract from the tip-tx of the bundle)
   - **Total compute units** consumed across the bundle's txs
   - **Bundle position in slot** if the block engine surfaces it (some endpoints do, some don't)
   - **Any reverted tx** — bundle is dropped on the first revert; name which one and the program error
6. If the bundle did NOT land, walk through the [jito-bundler](../agents/jito-bundler.md) "why didn't it land" checklist and surface the most likely cause: stale blockhash, low tip, compute-budget exhaustion, or independent revert.

## When to use

- Right after a high-stakes send, to confirm the bundle landed before publishing/logging success.
- When the bot's retry path got confused (e.g., "I think it landed but I'm not sure").
- For post-mortems on missed launches or rescue attempts.
- When tuning tip strategy: compare what you paid vs. what the slot's landed bundles paid.

## Avoid

- Don't infer "bundle landed" from `confirmTransaction` alone — a tx can confirm via a *non-bundle* path if the same blockhash was reused outside the bundle. Verify via the block engine.
- Don't trust the block engine's status as authoritative for whether *individual txs* succeeded — that's the cluster RPC's domain.
- Don't query the block engine with the wrong endpoint (mainnet vs devnet) — they share no state.
- Don't expose the bundle ID in public-facing logs without redaction; it can be used to look up the bundle's contents.
