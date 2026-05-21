/**
 * @pumpkit/core — Funding-source detection
 *
 * Determines whether a wallet was "seeded by pump.fun" — i.e. its first
 * inbound SOL transfer came from a known pump.fun source (fee recipient
 * or migration authority).
 *
 * This is the strict definition: a wallet that creators, scammers, or
 * indexers might want to verify as having been bootstrapped by pump.fun
 * itself rather than by some third party.
 */

import {
  PublicKey,
  type Connection,
  type ConfirmedSignatureInfo,
} from '@solana/web3.js';
import {
  PUMP_FEE_RECIPIENT_SET,
  PUMPFUN_MIGRATION_AUTHORITY,
} from './programs.js';

export interface FundingSourceResult {
  /** True iff the wallet's first inbound SOL transfer came from a pump.fun source. */
  seededByPump: boolean;
  /** Pubkey of the wallet that sent the first inbound SOL (null if none found). */
  firstFunder: string | null;
  /** Signature of the first inbound SOL tx. */
  firstFundingSignature: string | null;
  /** Slot of the first inbound SOL tx. */
  firstFundingSlot: number | null;
  /** Lamports received in the first inbound SOL tx. */
  firstFundingLamports: number | null;
  /** Number of signatures examined (capped by `maxSignatures`). */
  scannedSignatures: number;
  /** True if the scan hit `maxSignatures` without finding an inbound transfer. */
  scanTruncated: boolean;
}

export interface DetectSeededByPumpOptions {
  /** Max number of signatures to walk back through. Default 1000. */
  maxSignatures?: number;
  /** Page size for getSignaturesForAddress (capped at 1000 by RPC). Default 1000. */
  pageSize?: number;
  /** Additional addresses to treat as pump.fun-origin sources. */
  extraPumpSources?: Iterable<string>;
}

const RPC_MAX_PAGE = 1000;
const DEFAULT_MAX_SIGNATURES = 1000;

/**
 * Walks a wallet's signatures back to its oldest tx, finds the earliest
 * tx where the wallet's SOL balance increased, and returns whether the
 * sender was a known pump.fun address.
 */
export async function detectSeededByPump(
  wallet: string,
  connection: Connection,
  options: DetectSeededByPumpOptions = {}
): Promise<FundingSourceResult> {
  const maxSignatures = options.maxSignatures ?? DEFAULT_MAX_SIGNATURES;
  const pageSize = Math.min(options.pageSize ?? RPC_MAX_PAGE, RPC_MAX_PAGE);

  const pumpSources = new Set<string>(PUMP_FEE_RECIPIENT_SET);
  pumpSources.add(PUMPFUN_MIGRATION_AUTHORITY);
  if (options.extraPumpSources) {
    for (const s of options.extraPumpSources) pumpSources.add(s);
  }

  const pubkey = new PublicKey(wallet);

  // Page newest → oldest until we've collected all signatures (or hit cap).
  const signatures: ConfirmedSignatureInfo[] = [];
  let before: string | undefined;
  while (signatures.length < maxSignatures) {
    const remaining = maxSignatures - signatures.length;
    const limit = Math.min(pageSize, remaining);
    const page = await connection.getSignaturesForAddress(
      pubkey,
      { before, limit },
      'confirmed'
    );
    if (page.length === 0) break;
    signatures.push(...page);
    if (page.length < limit) break;
    before = page[page.length - 1]!.signature;
  }

  const scanTruncated = signatures.length >= maxSignatures;

  // Process oldest → newest.
  signatures.reverse();

  for (const sigInfo of signatures) {
    if (sigInfo.err) continue;

    const tx = await connection.getParsedTransaction(sigInfo.signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });
    if (!tx?.meta) continue;

    const accountKeys = tx.transaction.message.accountKeys;
    const walletIdx = accountKeys.findIndex(
      (a) => a.pubkey.toBase58() === wallet
    );
    if (walletIdx === -1) continue;

    const pre = tx.meta.preBalances[walletIdx];
    const post = tx.meta.postBalances[walletIdx];
    if (pre === undefined || post === undefined) continue;

    const delta = post - pre;
    if (delta <= 0) continue;

    // Sender = the non-wallet account with the largest balance decrease.
    let senderIdx = -1;
    let largestOutflow = 0;
    for (let i = 0; i < accountKeys.length; i++) {
      if (i === walletIdx) continue;
      const p = tx.meta.preBalances[i];
      const q = tx.meta.postBalances[i];
      if (p === undefined || q === undefined) continue;
      const outflow = p - q;
      if (outflow > largestOutflow) {
        largestOutflow = outflow;
        senderIdx = i;
      }
    }

    const sender =
      senderIdx >= 0 ? accountKeys[senderIdx]!.pubkey.toBase58() : null;

    return {
      seededByPump: sender !== null && pumpSources.has(sender),
      firstFunder: sender,
      firstFundingSignature: sigInfo.signature,
      firstFundingSlot: tx.slot,
      firstFundingLamports: delta,
      scannedSignatures: signatures.length,
      scanTruncated: false,
    };
  }

  return {
    seededByPump: false,
    firstFunder: null,
    firstFundingSignature: null,
    firstFundingSlot: null,
    firstFundingLamports: null,
    scannedSignatures: signatures.length,
    scanTruncated,
  };
}
