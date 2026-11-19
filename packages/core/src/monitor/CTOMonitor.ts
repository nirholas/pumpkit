// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//

/**
 * @pumpkit/core — Creator Transfer (CTO) Monitor
 *
 * Reports changes to the creator that earns a coin's creator fees, from the
 * Pump program's SetCreatorEvent, AdminCtoEvent and
 * MigrateBondingCurveCreatorEvent.
 */

import { PUMP_PROGRAM_ID } from '../solana/programs.js';
import type { PumpLogEvent } from '../solana/events.js';
import type { CTOEvent } from '../types/events.js';
import { LogsMonitor, type LogsMonitorOptions } from './LogsMonitor.js';

export interface CTOMonitorOptions extends LogsMonitorOptions {
  onCTO: (event: CTOEvent) => void | Promise<void>;
}

export class CTOMonitor extends LogsMonitor {
  private readonly onCTO: CTOMonitorOptions['onCTO'];

  constructor(options: CTOMonitorOptions) {
    super('CTOMonitor', [PUMP_PROGRAM_ID], options);
    this.onCTO = options.onCTO;
  }

  protected handleEvents(signature: string, slot: number, events: readonly PumpLogEvent[]): void {
    for (const event of events) {
      if (event.type !== 'creatorChange') continue;
      const e = event.data;
      this.emit(this.onCTO, {
        signature,
        slot,
        timestamp: Number(e.timestamp) * 1000,
        kind: e.kind,
        mint: e.mint,
        bondingCurve: e.bondingCurve,
        oldCreator: e.oldCreator,
        newCreator: e.newCreator,
      });
    }
  }
}
