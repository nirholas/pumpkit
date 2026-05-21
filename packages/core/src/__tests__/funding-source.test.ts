import { describe, it, expect, vi } from 'vitest';
import { PublicKey, type Connection } from '@solana/web3.js';
import { detectSeededByPump } from '../solana/funding-source.js';
import {
  PUMP_FEE_RECIPIENTS,
  PUMPFUN_FEE_ACCOUNT,
  PUMPFUN_MIGRATION_AUTHORITY,
} from '../solana/programs.js';

// ── Fixture helpers ────────────────────────────────────────────────────

const WALLET = '4Nd1mPq6t8RnTfRZqKQvN9LkW7gZkD2pSjQYrMxHv2eU';
const RANDOM_FUNDER = 'BnDZyR8eYpL9aXcVfHQ2sKpRwYj6mTpEzVcAuJ4kQnG3';
const PUMP_FUNDER = PUMP_FEE_RECIPIENTS[0];

function makeSigInfo(signature: string, slot: number, err: unknown = null) {
  return {
    signature,
    slot,
    blockTime: slot * 400,
    err,
    memo: null,
    confirmationStatus: 'finalized' as const,
  };
}

interface TxAccount {
  pubkey: string;
  preBalance: number;
  postBalance: number;
}

function makeTx(slot: number, accounts: TxAccount[]) {
  return {
    slot,
    blockTime: slot * 400,
    transaction: {
      message: {
        accountKeys: accounts.map((a) => ({
          pubkey: new PublicKey(a.pubkey),
          signer: false,
          writable: true,
          source: 'transaction' as const,
        })),
        instructions: [],
        recentBlockhash: '11111111111111111111111111111111',
      },
      signatures: [],
    },
    meta: {
      err: null,
      fee: 5000,
      preBalances: accounts.map((a) => a.preBalance),
      postBalances: accounts.map((a) => a.postBalance),
      innerInstructions: [],
      logMessages: [],
      preTokenBalances: [],
      postTokenBalances: [],
      rewards: [],
      status: { Ok: null },
    },
    version: 0 as const,
  };
}

function makeConn(
  signaturePages: ReturnType<typeof makeSigInfo>[][],
  txByHash: Record<string, ReturnType<typeof makeTx> | null>
): Connection {
  const getSignaturesForAddress = vi.fn(async (_addr, opts) => {
    const before = opts?.before as string | undefined;
    if (!before) return signaturePages[0] ?? [];
    // Find the page that starts AFTER `before`.
    for (let i = 0; i < signaturePages.length - 1; i++) {
      const page = signaturePages[i]!;
      if (page.length && page[page.length - 1]!.signature === before) {
        return signaturePages[i + 1] ?? [];
      }
    }
    return [];
  });
  const getParsedTransaction = vi.fn(async (sig: string) => txByHash[sig] ?? null);
  return { getSignaturesForAddress, getParsedTransaction } as unknown as Connection;
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('detectSeededByPump', () => {
  it('returns seededByPump=true when first inbound SOL is from a pump fee recipient', async () => {
    const sig = 'sig-pump-funded';
    const conn = makeConn(
      [[makeSigInfo(sig, 100)]],
      {
        [sig]: makeTx(100, [
          { pubkey: PUMP_FUNDER, preBalance: 10_000_000_000, postBalance: 9_950_000_000 },
          { pubkey: WALLET, preBalance: 0, postBalance: 50_000_000 },
        ]),
      }
    );

    const result = await detectSeededByPump(WALLET, conn);

    expect(result.seededByPump).toBe(true);
    expect(result.firstFunder).toBe(PUMP_FUNDER);
    expect(result.firstFundingSignature).toBe(sig);
    expect(result.firstFundingSlot).toBe(100);
    expect(result.firstFundingLamports).toBe(50_000_000);
    expect(result.scannedSignatures).toBe(1);
  });

  it('returns seededByPump=false when first inbound SOL is from an unrelated wallet', async () => {
    const sig = 'sig-random-funded';
    const conn = makeConn(
      [[makeSigInfo(sig, 200)]],
      {
        [sig]: makeTx(200, [
          { pubkey: RANDOM_FUNDER, preBalance: 5_000_000_000, postBalance: 4_900_000_000 },
          { pubkey: WALLET, preBalance: 0, postBalance: 100_000_000 },
        ]),
      }
    );

    const result = await detectSeededByPump(WALLET, conn);

    expect(result.seededByPump).toBe(false);
    expect(result.firstFunder).toBe(RANDOM_FUNDER);
    expect(result.firstFundingLamports).toBe(100_000_000);
  });

  it('recognises the legacy PUMPFUN_FEE_ACCOUNT as a pump source', async () => {
    const sig = 'sig-legacy';
    const conn = makeConn(
      [[makeSigInfo(sig, 50)]],
      {
        [sig]: makeTx(50, [
          { pubkey: PUMPFUN_FEE_ACCOUNT, preBalance: 1e10, postBalance: 1e10 - 1e8 },
          { pubkey: WALLET, preBalance: 0, postBalance: 1e8 },
        ]),
      }
    );

    const result = await detectSeededByPump(WALLET, conn);
    expect(result.seededByPump).toBe(true);
  });

  it('recognises PUMPFUN_MIGRATION_AUTHORITY as a pump source', async () => {
    const sig = 'sig-migration';
    const conn = makeConn(
      [[makeSigInfo(sig, 75)]],
      {
        [sig]: makeTx(75, [
          { pubkey: PUMPFUN_MIGRATION_AUTHORITY, preBalance: 1e10, postBalance: 1e10 - 2e8 },
          { pubkey: WALLET, preBalance: 0, postBalance: 2e8 },
        ]),
      }
    );

    const result = await detectSeededByPump(WALLET, conn);
    expect(result.seededByPump).toBe(true);
    expect(result.firstFunder).toBe(PUMPFUN_MIGRATION_AUTHORITY);
  });

  it('walks past outbound and erroring txs to find the first inbound', async () => {
    // Order from RPC is newest-first. Detection reverses to oldest-first.
    // Oldest: outbound (delta<=0) — should be skipped.
    // Middle: errored tx — should be skipped.
    // Then:  inbound from pump — should match.
    const conn = makeConn(
      [[
        makeSigInfo('newest-inbound', 300),
        makeSigInfo('middle-errored', 200, { InstructionError: [0, 'Custom'] }),
        makeSigInfo('oldest-outbound', 100),
      ]],
      {
        'oldest-outbound': makeTx(100, [
          { pubkey: WALLET, preBalance: 1e9, postBalance: 9e8 },
          { pubkey: RANDOM_FUNDER, preBalance: 0, postBalance: 1e8 },
        ]),
        'middle-errored': makeTx(200, [
          { pubkey: PUMP_FUNDER, preBalance: 1e10, postBalance: 9e9 },
          { pubkey: WALLET, preBalance: 9e8, postBalance: 9e8 },
        ]),
        'newest-inbound': makeTx(300, [
          { pubkey: PUMP_FUNDER, preBalance: 1e10, postBalance: 9.99e9 },
          { pubkey: WALLET, preBalance: 9e8, postBalance: 9.1e8 },
        ]),
      }
    );

    const result = await detectSeededByPump(WALLET, conn);

    expect(result.seededByPump).toBe(true);
    expect(result.firstFundingSignature).toBe('newest-inbound');
  });

  it('returns null fields when wallet has no signatures', async () => {
    const conn = makeConn([[]], {});
    const result = await detectSeededByPump(WALLET, conn);

    expect(result.seededByPump).toBe(false);
    expect(result.firstFunder).toBeNull();
    expect(result.firstFundingSignature).toBeNull();
    expect(result.scannedSignatures).toBe(0);
    expect(result.scanTruncated).toBe(false);
  });

  it('honours extraPumpSources for custom test wallets', async () => {
    const customSource = 'CustomTestSource111111111111111111111111111';
    // Need a valid base58 pubkey — use a real keypair generator shape via PublicKey.
    const validCustom = PublicKey.unique().toBase58();
    const sig = 'sig-custom';
    const conn = makeConn(
      [[makeSigInfo(sig, 400)]],
      {
        [sig]: makeTx(400, [
          { pubkey: validCustom, preBalance: 1e9, postBalance: 9e8 },
          { pubkey: WALLET, preBalance: 0, postBalance: 1e8 },
        ]),
      }
    );

    const withoutExtra = await detectSeededByPump(WALLET, conn);
    expect(withoutExtra.seededByPump).toBe(false);

    const withExtra = await detectSeededByPump(WALLET, conn, {
      extraPumpSources: [validCustom],
    });
    expect(withExtra.seededByPump).toBe(true);

    // customSource is unused — silences ts unused-var noise without changing behaviour.
    void customSource;
  });

  it('paginates getSignaturesForAddress when a page is full', async () => {
    // First page is full (size=2 here), so we ask for another page using `before`.
    const newest = makeSigInfo('newest', 500);
    const middle = makeSigInfo('middle', 400);
    const oldest = makeSigInfo('oldest', 300);

    const conn = makeConn(
      [[newest, middle], [oldest]],
      {
        oldest: makeTx(300, [
          { pubkey: PUMP_FUNDER, preBalance: 1e10, postBalance: 9.5e9 },
          { pubkey: WALLET, preBalance: 0, postBalance: 5e8 },
        ]),
        // Newer txs would not change the answer; mark them as outbound noise.
        middle: makeTx(400, [
          { pubkey: WALLET, preBalance: 5e8, postBalance: 4e8 },
          { pubkey: RANDOM_FUNDER, preBalance: 0, postBalance: 1e8 },
        ]),
        newest: makeTx(500, [
          { pubkey: WALLET, preBalance: 4e8, postBalance: 3e8 },
          { pubkey: RANDOM_FUNDER, preBalance: 1e8, postBalance: 2e8 },
        ]),
      }
    );

    const result = await detectSeededByPump(WALLET, conn, { pageSize: 2 });

    expect(result.seededByPump).toBe(true);
    expect(result.firstFundingSignature).toBe('oldest');
    expect(result.scannedSignatures).toBe(3);
  });
});
