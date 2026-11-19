// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

/**
 * @pumpkit/core — Whale Trade Monitor
 *
 * Detects bonding curve trades that exceed a configurable SOL threshold.
 * Decodes every Pump TradeEvent in the transaction logs, which covers
 * legacy buys/sells, `buy_v3` / `sell_v3` / `buy_exact_quote_in_v3`, and the
 * curve hops of a PumpSwap `multi_hop_swap`. A buy that empties the curve
 * and continues into the new pool (synthetic migration) is reported once,
 * with the pool part from PostCompleteBuyEvent added in.
 *
 * The threshold is in SOL, so only SOL-quoted curves are compared against
 * it; trades on USDC or pump-coin quoted curves are skipped.
 */

import { PUMP_PROGRAM_ID } from '../solana/programs.js';
import { aggregateTrades, isSolQuoteMint, type AggregatedTrade, type PumpLogEvent } from '../solana/events.js';
import type { WhaleTradeEvent } from '../types/events.js';
import { LogsMonitor, type LogsMonitorOptions } from './LogsMonitor.js';

const LAMPORTS_PER_SOL = 1_000_000_000;
const TOKEN_DECIMALS = 1_000_000;

export interface WhaleMonitorOptions extends LogsMonitorOptions {
  /** Minimum SOL amount to qualify as a whale trade (default: 10) */
  minSol?: number;
  onWhaleTrade: (event: WhaleTradeEvent) => void | Promise<void>;
}

export class WhaleMonitor extends LogsMonitor {
  private readonly onWhaleTrade: WhaleMonitorOptions['onWhaleTrade'];
  private readonly minSol: number;

  constructor(options: WhaleMonitorOptions) {
    super('WhaleMonitor', [PUMP_PROGRAM_ID], options);
    this.onWhaleTrade = options.onWhaleTrade;
    this.minSol = options.minSol ?? 10;
  }

  protected handleEvents(signature: string, _slot: number, events: readonly PumpLogEvent[]): void {
    for (const trade of aggregateTrades(events)) {
      const event = this.toWhaleTrade(signature, trade);
      if (event) this.emit(this.onWhaleTrade, event);
    }
  }

  private toWhaleTrade(signature: string, trade: AggregatedTrade): WhaleTradeEvent | null {
    if (!isSolQuoteMint(trade.quoteMint)) return null;
    const solAmount = Number(trade.solAmount) / LAMPORTS_PER_SOL;
    if (solAmount < this.minSol) return null;
    return {
      signature,
      mint: trade.mint,
      trader: trade.user,
      side: trade.isBuy ? 'buy' : 'sell',
      solAmount,
      tokenAmount: Number(trade.tokenAmount) / TOKEN_DECIMALS,
      timestamp: Number(trade.timestamp) * 1000,
      ...(trade.ixName ? { instruction: trade.ixName } : {}),
      syntheticMigration: trade.syntheticMigration,
    };
  }
}
