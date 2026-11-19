// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//

/**
 * @pumpkit/core — Launch Monitor
 *
 * Reports new coins from the Pump program's CreateEvent, emitted by both
 * `create` and `create_v2`.
 */

import { PUMP_PROGRAM_ID } from '../solana/programs.js';
import type { PumpLogEvent } from '../solana/events.js';
import type { LaunchEvent } from '../types/events.js';
import { LogsMonitor, type LogsMonitorOptions } from './LogsMonitor.js';

export interface LaunchMonitorOptions extends LogsMonitorOptions {
  onLaunch: (event: LaunchEvent) => void | Promise<void>;
}

export class LaunchMonitor extends LogsMonitor {
  private readonly onLaunch: LaunchMonitorOptions['onLaunch'];

  constructor(options: LaunchMonitorOptions) {
    super('LaunchMonitor', [PUMP_PROGRAM_ID], options);
    this.onLaunch = options.onLaunch;
  }

  protected handleEvents(signature: string, slot: number, events: readonly PumpLogEvent[]): void {
    for (const event of events) {
      if (event.type !== 'create') continue;
      const e = event.data;
      this.emit(this.onLaunch, {
        signature,
        slot,
        timestamp: Number(e.timestamp) * 1000,
        mint: e.mint,
        bondingCurve: e.bondingCurve,
        creator: e.creator,
        user: e.user,
        name: e.name,
        symbol: e.symbol,
        uri: e.uri,
        isMayhemMode: e.isMayhemMode,
        hasCashback: e.isCashbackEnabled,
        quoteMint: e.quoteMint,
      });
    }
  }
}
