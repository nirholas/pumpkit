// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//

/**
 * @pumpkit/core — Graduation Monitor
 *
 * Reports bonding curves that complete (CompleteEvent) and curves that
 * migrate to a PumpSwap pool (CompletePumpAmmMigrationEvent). When both
 * happen in one transaction they are merged into a single event per mint.
 */

import { PUMP_PROGRAM_ID } from '../solana/programs.js';
import type { PumpLogEvent } from '../solana/events.js';
import type { GraduationEvent } from '../types/events.js';
import { LogsMonitor, type LogsMonitorOptions } from './LogsMonitor.js';

export interface GraduationMonitorOptions extends LogsMonitorOptions {
  onGraduation: (event: GraduationEvent) => void | Promise<void>;
}

export class GraduationMonitor extends LogsMonitor {
  private readonly onGraduation: GraduationMonitorOptions['onGraduation'];

  constructor(options: GraduationMonitorOptions) {
    super('GraduationMonitor', [PUMP_PROGRAM_ID], options);
    this.onGraduation = options.onGraduation;
  }

  protected handleEvents(signature: string, slot: number, events: readonly PumpLogEvent[]): void {
    const byMint = new Map<string, GraduationEvent>();
    for (const event of events) {
      if (event.type !== 'complete' && event.type !== 'ammMigration') continue;
      const e = event.data;
      const current = byMint.get(e.mint) ?? {
        signature,
        slot,
        timestamp: Number(e.timestamp) * 1000,
        mint: e.mint,
        bondingCurve: e.bondingCurve,
        user: e.user,
        curveCompleted: false,
        poolAddress: null,
        quoteMint: e.quoteMint,
      };
      if (event.type === 'complete') current.curveCompleted = true;
      else current.poolAddress = event.data.pool;
      current.quoteMint ??= e.quoteMint;
      byMint.set(e.mint, current);
    }
    for (const graduation of byMint.values()) this.emit(this.onGraduation, graduation);
  }
}
