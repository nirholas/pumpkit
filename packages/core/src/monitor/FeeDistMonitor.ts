// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//

/**
 * @pumpkit/core — Fee Distribution Monitor
 *
 * Reports creator fee payouts to a coin's fee sharing shareholders, from the
 * Pump program's DistributeCreatorFeesEvent.
 */

import { PUMP_PROGRAM_ID } from '../solana/programs.js';
import type { PumpLogEvent } from '../solana/events.js';
import type { FeeDistEvent } from '../types/events.js';
import { LogsMonitor, type LogsMonitorOptions } from './LogsMonitor.js';

export interface FeeDistMonitorOptions extends LogsMonitorOptions {
  onFeeDist: (event: FeeDistEvent) => void | Promise<void>;
}

export class FeeDistMonitor extends LogsMonitor {
  private readonly onFeeDist: FeeDistMonitorOptions['onFeeDist'];

  constructor(options: FeeDistMonitorOptions) {
    super('FeeDistMonitor', [PUMP_PROGRAM_ID], options);
    this.onFeeDist = options.onFeeDist;
  }

  protected handleEvents(signature: string, slot: number, events: readonly PumpLogEvent[]): void {
    for (const event of events) {
      if (event.type !== 'creatorFeeDistribution') continue;
      const e = event.data;
      this.emit(this.onFeeDist, {
        signature,
        slot,
        timestamp: Number(e.timestamp) * 1000,
        mint: e.mint,
        sharingConfig: e.sharingConfig,
        totalAmount: e.distributed,
        quoteMint: e.quoteMint,
        shareholders: e.shareholders,
      });
    }
  }
}
