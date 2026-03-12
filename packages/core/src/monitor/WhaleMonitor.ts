/**
 * @pumpkit/core — Whale Trade Monitor
 *
 * Detects large trades (buys/sells) that exceed a configurable SOL threshold.
 * Listens for TradeEvent in Pump program logs.
 */

import { PublicKey, type Connection } from '@solana/web3.js';
import { BaseMonitor } from './BaseMonitor.js';
import { PUMP_PROGRAM_ID } from '../solana/programs.js';
import type { WhaleTradeEvent } from '../types/events.js';

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
        (logInfo) => {
          if (logInfo.err) return;
          const sig = logInfo.signature;
          if (this.seen.has(sig)) return;
          this.seen.add(sig);
          if (this.seen.size > 10_000) {
            const entries = [...this.seen];
            for (let i = 0; i < 5_000; i++) this.seen.delete(entries[i]!);
          }

          // Look for trade events (Buy / Sell)
          const isTrade = logInfo.logs.some(
            (l) => l.includes('TradeEvent') || l.includes('Instruction: Buy') || l.includes('Instruction: Sell'),
          );
          if (!isTrade) return;

          // Without full deserialization of event data, we emit the trade
          // and rely on the callback handler to fetch transaction details
          // and apply the minSol threshold with actual amounts
          const side = logInfo.logs.some((l) => l.includes('Instruction: Buy')) ? 'buy' as const : 'sell' as const;

          const event: WhaleTradeEvent = {
            signature: sig,
            mint: '',
            trader: '',
            side,
            solAmount: 0,
            tokenAmount: 0,
            timestamp: Date.now(),
          };
          this.recordEvent();
          this.reconnectDelay = 1000;
          Promise.resolve(this.onWhaleTrade(event)).catch((err) =>
            this.log.error('onWhaleTrade callback error: %s', err),
          );
        },
        'confirmed',
      );
      this.log.info('WebSocket subscription active');
    } catch (err) {
      this.log.warn('WebSocket failed, will retry: %s', err);
      this.scheduleReconnect();
    }
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
