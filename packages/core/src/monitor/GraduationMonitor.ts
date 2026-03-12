/**
 * @pumpkit/core — Graduation Monitor
 *
 * Detects token graduation events (bonding curve → AMM pool migration).
 * Listens for CompleteEvent discriminator in Pump program logs.
 */

import { PublicKey, type Connection } from '@solana/web3.js';
import { BaseMonitor } from './BaseMonitor.js';
import { PUMP_PROGRAM_ID } from '../solana/programs.js';
import type { GraduationEvent } from '../types/events.js';

export interface GraduationMonitorOptions {
  connection: Connection;
  onGraduation: (event: GraduationEvent) => void | Promise<void>;
}

export class GraduationMonitor extends BaseMonitor {
  private readonly connection: Connection;
  private readonly onGraduation: GraduationMonitorOptions['onGraduation'];
  private subscriptionId: number | null = null;
  private readonly seen = new Set<string>();
  private reconnectDelay = 1000;
  private readonly maxReconnectDelay = 30_000;

  constructor(options: GraduationMonitorOptions) {
    super('GraduationMonitor');
    this.connection = options.connection;
    this.onGraduation = options.onGraduation;
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

          // Graduation = CompleteEvent — bonding curve is marked complete
          const isGraduation = logInfo.logs.some(
            (l) => l.includes('CompleteEvent') || l.includes('Program log: complete'),
          );
          if (!isGraduation) return;

          const event: GraduationEvent = {
            signature: sig,
            mint: '',
            tokenName: '',
            tokenSymbol: '',
            poolAddress: '',
            timestamp: Date.now(),
          };
          this.recordEvent();
          this.reconnectDelay = 1000;
          Promise.resolve(this.onGraduation(event)).catch((err) =>
            this.log.error('onGraduation callback error: %s', err),
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
