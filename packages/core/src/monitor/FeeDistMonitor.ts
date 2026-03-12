/**
 * @pumpkit/core — Fee Distribution Monitor
 *
 * Detects fee distribution events from the PumpFees program.
 * Listens for distribute_fees instructions and shareholder payouts.
 */

import { PublicKey, type Connection } from '@solana/web3.js';
import { BaseMonitor } from './BaseMonitor.js';
import { PUMP_FEE_PROGRAM_ID } from '../solana/programs.js';
import type { FeeDistEvent } from '../types/events.js';

export interface FeeDistMonitorOptions {
  connection: Connection;
  onFeeDist: (event: FeeDistEvent) => void | Promise<void>;
}

export class FeeDistMonitor extends BaseMonitor {
  private readonly connection: Connection;
  private readonly onFeeDist: FeeDistMonitorOptions['onFeeDist'];
  private subscriptionId: number | null = null;
  private readonly seen = new Set<string>();
  private reconnectDelay = 1000;
  private readonly maxReconnectDelay = 30_000;

  constructor(options: FeeDistMonitorOptions) {
    super('FeeDistMonitor');
    this.connection = options.connection;
    this.onFeeDist = options.onFeeDist;
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this.log.info('Starting...');
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
        new PublicKey(PUMP_FEE_PROGRAM_ID),
        (logInfo) => {
          if (logInfo.err) return;
          const sig = logInfo.signature;
          if (this.seen.has(sig)) return;
          this.seen.add(sig);
          if (this.seen.size > 10_000) {
            const entries = [...this.seen];
            for (let i = 0; i < 5_000; i++) this.seen.delete(entries[i]!);
          }

          // Fee distribution instructions
          const isFeeDist = logInfo.logs.some(
            (l) =>
              l.includes('Instruction: DistributeFees') ||
              l.includes('FeeDistributionEvent') ||
              l.includes('distribute_fees'),
          );
          if (!isFeeDist) return;

          const event: FeeDistEvent = {
            signature: sig,
            mint: '',
            totalAmount: 0,
            shareholders: [],
            timestamp: Date.now(),
          };
          this.recordEvent();
          this.reconnectDelay = 1000;
          Promise.resolve(this.onFeeDist(event)).catch((err) =>
            this.log.error('onFeeDist callback error: %s', err),
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
