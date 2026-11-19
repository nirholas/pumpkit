// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
// Part of PumpKit — https://github.com/nirholas/pumpkit

/**
 * @pumpkit/core — Logs Monitor
 *
 * Shared plumbing for monitors that follow program logs over the RPC
 * websocket: one `logsSubscribe` per program, signature de-duplication
 * across those subscriptions, event decoding, and callback isolation.
 *
 * Reconnects are handled by web3.js: its websocket client reconnects and
 * re-issues every active subscription on its own.
 */

import { PublicKey, type Commitment, type Connection, type Logs } from '@solana/web3.js';

import { parsePumpLogEvents, type PumpLogEvent } from '../solana/events.js';
import { BoundedSet } from '../util/bounded-set.js';
import { BaseMonitor } from './BaseMonitor.js';

const SEEN_SIGNATURES = 10_000;

export interface LogsMonitorOptions {
    connection: Connection;
    /** Commitment for the log subscription (default: `confirmed`). */
    commitment?: Commitment;
}

export abstract class LogsMonitor extends BaseMonitor {
    protected readonly connection: Connection;
    private readonly commitment: Commitment;
    private readonly programIds: readonly string[];
    private subscriptionIds: number[] = [];
    private readonly seen = new BoundedSet<string>(SEEN_SIGNATURES);

    protected constructor(name: string, programIds: readonly string[], options: LogsMonitorOptions) {
        super(name);
        this.connection = options.connection;
        this.commitment = options.commitment ?? 'confirmed';
        this.programIds = programIds;
    }

    start(): void {
        if (this._running) return;
        this._running = true;
        this.subscriptionIds = this.programIds.map((id) =>
            this.connection.onLogs(new PublicKey(id), (logs, ctx) => this.handleLogs(logs, ctx.slot), this.commitment),
        );
        this.log.info('Subscribed to logs of %d program(s)', this.programIds.length);
    }

    stop(): void {
        if (!this._running) return;
        this._running = false;
        for (const id of this.subscriptionIds) {
            this.connection.removeOnLogsListener(id).catch((err: unknown) => {
                this.log.warn('Failed to remove log listener %d: %s', id, err);
            });
        }
        this.subscriptionIds = [];
        this.log.info('Stopped');
    }

    /** Called once per successful transaction with the Pump events it emitted. */
    protected abstract handleEvents(signature: string, slot: number, events: readonly PumpLogEvent[]): void;

    /** Deliver an event to a user callback; a throw or rejection is logged, never propagated. */
    protected emit<T>(callback: (event: T) => void | Promise<void>, event: T): void {
        this.recordEvent();
        Promise.resolve()
            .then(() => callback(event))
            .catch((err: unknown) => this.log.error('Callback error: %s', err));
    }

    /** Exposed for tests: feed one log notification through the monitor. */
    handleLogs(logs: Logs, slot: number): void {
        if (logs.err) return;
        if (!this.seen.add(logs.signature)) return;
        let events: PumpLogEvent[];
        try {
            events = parsePumpLogEvents(logs.logs);
        } catch (err) {
            this.log.warn('Could not parse logs of %s: %s', logs.signature, err);
            return;
        }
        if (events.length > 0) this.handleEvents(logs.signature, slot, events);
    }
}
