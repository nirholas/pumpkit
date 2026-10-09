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

import { PublicKey, type Connection, type Logs } from '@solana/web3.js';
import { BaseMonitor } from './BaseMonitor.js';
import { PUMP_PROGRAM_ID } from '../solana/programs.js';
import { aggregateTrades, isSolQuoteMint, parsePumpLogEvents, type AggregatedTrade } from '../solana/events.js';
import type { WhaleTradeEvent } from '../types/events.js';

const LAMPORTS_PER_SOL = 1_000_000_000;
const TOKEN_DECIMALS = 1_000_000;

export interface WhaleMonitorOptions {
  connection: Connection;
  /** Minimum SOL amount to qualify as a whale trade (default: 10) */
  minSol?: number;
  onWhaleTrade: (event: WhaleTradeEvent) => void | Promise<void>;
}

export class WhaleMonitor extends BaseMonitor {
  private readonly connection: Connection;
  private readonly onWhaleTrade: WhaleMonitorOptions['onWhaleTrade'];
  private readonly minSol: number;
  private subscriptionId: number | null = null;
  private readonly seen = new Set<string>();
  private reconnectDelay = 1000;
  private readonly maxReconnectDelay = 30_000;

  constructor(options: WhaleMonitorOptions) {
    super('WhaleMonitor');
    this.connection = options.connection;
    this.onWhaleTrade = options.onWhaleTrade;
    this.minSol = options.minSol ?? 10;
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this.log.info('Starting (minSol=%d)...', this.minSol);
    this.subscribe();
  }

  stop(): void {
    this._running = false;
    if (this.subscriptionId !== null) {
      this.connection.removeOnLogsListener(this.subscriptionId).catch(() => {});
      this.subscriptionId = null;
    }
    this.log.info('Stopped');
  }

  private subscribe(): void {
    try {
      this.subscriptionId = this.connection.onLogs(
        new PublicKey(PUMP_PROGRAM_ID),
        (logInfo) => this.handleLogs(logInfo),
        'confirmed',
      );
      this.log.info('WebSocket subscription active');
    } catch (err) {
      this.log.warn('WebSocket failed, will retry: %s', err);
      this.scheduleReconnect();
    }
  }

  private handleLogs(logInfo: Logs): void {
    if (logInfo.err) return;
    const sig = logInfo.signature;
    if (this.seen.has(sig)) return;
    this.seen.add(sig);
    if (this.seen.size > 10_000) {
      const entries = [...this.seen];
      for (let i = 0; i < 5_000; i++) this.seen.delete(entries[i]!);
    }
    this.reconnectDelay = 1000;

    const trades = aggregateTrades(parsePumpLogEvents(logInfo.logs));
    for (const trade of trades) {
      const event = this.toWhaleTrade(sig, trade);
      if (!event) continue;
      this.recordEvent();
      Promise.resolve(this.onWhaleTrade(event)).catch((err) =>
        this.log.error('onWhaleTrade callback error: %s', err),
      );
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

  private scheduleReconnect(): void {
    if (!this._running) return;
    this.log.info('Reconnecting in %dms…', this.reconnectDelay);
    setTimeout(() => {
      if (this._running) this.subscribe();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }
}
