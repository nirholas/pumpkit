# pump-launch-toolkit

Atomic scripts for launching, collecting fees from, and trading pump.fun coins. Built around **Jito bundles** for atomicity across multiple txs — useful when:

- You need the create tx's fee payer to differ from the wallet supplying the SOL (separate funder vs creator)
- The creator wallet has a public/shared private key (e.g. multi-sig setup, or you accept other signers exist) and you want every fee collection to atomically move the SOL to a safe wallet on the same tx
- You want to win the race against MEV/sweeper bots watching specific addresses

> ⚠️ **Secrets handling.** All scripts read keypairs from environment variables (base58) or local JSON files. **Never commit either form.** `.gitignore` excludes `*.json` by default (with allowlist exceptions for build files).

## Scripts

| Script | Purpose |
|---|---|
| `metadata.js` | Upload token metadata to pump.fun's IPFS endpoint. Returns a URI to pass to launchers. |
| `fire-jito.js` | **Launch via Jito bundle.** Two-tx bundle: funder pays rent + tip in Tx1; creator pays own fee in Tx2 (createV2). Solscan "from" on the create = creator. |
| `fire-atomic-create.js` | Single-tx create-only launch. No Jito needed. Fee payer = funder; on-chain creator = creator wallet (signed but not fee payer). |
| `collect-jito.js` | Atomic creator-fee collection. Single tx: pump's `collectCoinCreatorFee` + drain to `DESTINATION`. No window for a competing collector with the same key. |
| `watch-collect.js` | Long-running poller that runs `collect-jito.js` whenever the vault accumulates ≥ threshold. |
| `consolidate.js` | One-shot: collect creator vault + drain creator wallet + drain funder, all to `DESTINATION`, in one Jito bundle tx. |
| `buy-jito.js` | Buy a token via Jupiter aggregator using a Jito bundle. Useful when pump-sdk's buy ix is out of sync with the live program. |
| `rescue-tokens.js` | Atomic SPL/Token-2022 transfer via Jito bundle. Bot can't insert. |
| `distribute.js` | Sqrt-weighted USDC rewards distribution to holders. Includes `EMERGENCY` mode for sweeping to a single address. |
| `grind.js` | JS-based vanity address grinder (slow). `solana-keygen grind` is far faster. |

## Setup

```bash
npm install
cp .env.example .env
# fill in .env with your keys and target addresses
```

## Typical launch flow

```bash
# 1. Upload metadata (gets a URI)
NAME="MyCoin" SYMBOL="MEME" IMAGE_PATH=./logo.png \
  node metadata.js
# -> https://ipfs.io/ipfs/<CID>

# 2. Launch via Jito bundle (creator = fee payer of create tx)
URI="https://ipfs.io/ipfs/<CID>" \
NAME=MyCoin SYMBOL=MEME \
FUNDER_SECRET=<base58> \
CREATOR_SECRET=<base58> \
JITO_TIP=0.005 \
  node fire-jito.js
```

## Collecting + auto-collecting

```bash
# Manual one-shot
DESTINATION=<your-safe-wallet> \
FUNDER_SECRET=<base58> \
CREATOR_SECRET=<base58> \
  node collect-jito.js

# Long-running watcher (polls every 30s)
DESTINATION=<your-safe-wallet> \
FUNDER_SECRET=<base58> \
CREATOR_SECRET=<base58> \
CREATOR_PUBKEY=<base58-pubkey> \
MIN_COLLECT_SOL=0.05 \
  node watch-collect.js
```

## Security notes

- **Sweeper bots watch public/leaked keys.** SOL or tokens that *rest* in such a wallet for more than a few seconds will be drained. The atomic patterns in this toolkit work around this by ensuring funds never settle there.
- **Token-2022 sweepers exist.** If you buy a token *to* a public/shared wallet, expect the tokens to be moved out by other key-holders within ~3 seconds. Use `rescue-tokens.js` patterns to atomically buy-and-transfer if you need plausible deniability about the buyer wallet.
- **Jito tip auctions.** 0.001 SOL is the floor but rarely lands in busy times. Start at 0.005, bump to 0.01–0.02 if bundles return `Invalid` from Jito.
- **Jito tip account rotation.** The hardcoded list may drift. Fetch `getTipAccounts` from the Jito Block Engine RPC if you hit `"Bundles must write lock at least one tip account"` errors.
- **pump-sdk version drift.** The buy instruction may add required accounts that older SDK versions don't include (e.g. `BuybackFeeRecipient`). When this happens, route buys through Jupiter (`buy-jito.js`) instead.

## Architecture: why Jito bundles

A pump.fun create instruction has many accounts and is near the 1232-byte tx size limit. To make the create tx come **from** the creator wallet (so on-chain attribution matches), you'd need to also fund the creator with rent SOL atomically — but that pushes the tx over size.

Jito bundles solve this: two separate txs that share a blockhash and execute atomically (all-or-nothing) on the block engine. No bot can insert between them. This is the basis of `fire-jito.js`, `collect-jito.js`, `consolidate.js`, `buy-jito.js`, and `rescue-tokens.js`.

## License

MIT
