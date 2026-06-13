#!/usr/bin/env tsx

// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
// Part of PumpKit — https://github.com/nirholas/atomic

/**
 * Check whether a wallet was seeded by pump.fun.
 *
 * Usage:
 *   npx tsx tools/check-pump-funding.ts <walletAddress> [rpcUrl]
 *
 * Env:
 *   RPC_URL  — alternative to the positional rpcUrl arg.
 */

import { Connection } from '@solana/web3.js';
import { detectSeededByPump } from '../packages/core/src/solana/funding-source.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const NC = '\x1b[0m';

async function main(): Promise<void> {
  const [, , wallet, rpcArg] = process.argv;
  if (!wallet) {
    console.error('Usage: npx tsx tools/check-pump-funding.ts <walletAddress> [rpcUrl]');
    process.exit(1);
  }

  const rpcUrl =
    rpcArg ?? process.env['RPC_URL'] ?? 'https://api.mainnet-beta.solana.com';

  console.log(`${DIM}Wallet: ${wallet}${NC}`);
  console.log(`${DIM}RPC:    ${rpcUrl}${NC}`);
  console.log(`${DIM}Scanning signatures…${NC}\n`);

  const connection = new Connection(rpcUrl, 'confirmed');
  const t0 = Date.now();
  const result = await detectSeededByPump(wallet, connection);
  const ms = Date.now() - t0;

  const verdict = result.seededByPump
    ? `${GREEN}${BOLD}SEEDED BY PUMP.FUN${NC}`
    : `${RED}${BOLD}NOT seeded by pump.fun${NC}`;

  console.log(`Verdict:           ${verdict}`);
  console.log(`First funder:      ${result.firstFunder ?? '(none)'}`);
  console.log(`First funding tx:  ${result.firstFundingSignature ?? '(none)'}`);
  console.log(`Slot:              ${result.firstFundingSlot ?? '(none)'}`);
  console.log(
    `Amount:            ${
      result.firstFundingLamports !== null
        ? (result.firstFundingLamports / 1e9).toFixed(6) + ' SOL'
        : '(none)'
    }`
  );
  console.log(`Signatures seen:   ${result.scannedSignatures}`);
  if (result.scanTruncated) {
    console.log(`${DIM}(scan hit the maxSignatures cap — older history not examined)${NC}`);
  }
  console.log(`${DIM}Done in ${ms}ms${NC}`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});