// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//

/**
 * @pumpkit/core — Claim Monitor
 *
 * Reports fee claims decoded from program events:
 *   - Pump `collect_creator_fee` (CollectCreatorFeeEvent)
 *   - PumpSwap `collect_coin_creator_fee` (CollectCoinCreatorFeeEvent)
 *   - Pump and PumpSwap `claim_cashback` (ClaimCashbackEvent)
 *   - PumpFees `claim_social_fee_pda` (SocialFeePdaClaimed)
 *
 * Creator vaults are per creator, not per coin, so claim events carry the
 * receiving wallet but no mint.
 */

import { PUMP_AMM_PROGRAM_ID, PUMP_FEE_PROGRAM_ID, PUMP_PROGRAM_ID } from '../solana/programs.js';
import type { PumpLogEvent } from '../solana/events.js';
import type { ClaimEvent } from '../types/events.js';
import { LogsMonitor, type LogsMonitorOptions } from './LogsMonitor.js';

export interface ClaimMonitorOptions extends LogsMonitorOptions {
  onClaim: (event: ClaimEvent) => void | Promise<void>;
}

export class ClaimMonitor extends LogsMonitor {
  private readonly onClaim: ClaimMonitorOptions['onClaim'];

  constructor(options: ClaimMonitorOptions) {
    super('ClaimMonitor', [PUMP_PROGRAM_ID, PUMP_AMM_PROGRAM_ID, PUMP_FEE_PROGRAM_ID], options);
    this.onClaim = options.onClaim;
  }

  protected handleEvents(signature: string, slot: number, events: readonly PumpLogEvent[]): void {
    for (const event of events) {
      if (event.type !== 'feeClaim') continue;
      const { kind, program, wallet, amount, quoteMint, timestamp } = event.data;
      this.emit(this.onClaim, {
        signature,
        slot,
        timestamp: Number(timestamp) * 1000,
        kind,
        program,
        wallet,
        amount,
        quoteMint,
      });
    }
  }
}
