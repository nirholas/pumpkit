// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

/**
 * @pumpkit/core — Graceful Shutdown
 *
 * Registers signal handlers for clean bot shutdown.
 */

import { log } from './logger.js';
import type { ShutdownHandler } from './types.js';

const DEFAULT_HANDLER_TIMEOUT_MS = 10_000;

const handlers: ShutdownHandler[] = [];
let installed = false;
let shuttingDown = false;

/**
 * Register a cleanup handler to run on SIGINT/SIGTERM.
 * Handlers run in registration order.
 */
export function onShutdown(handler: ShutdownHandler): void {
    handlers.push(handler);
}

/**
 * Run every registered handler in order. A handler that throws, rejects or
 * takes longer than `timeoutMs` is logged and skipped, so one stuck
 * connection cannot keep the process alive.
 */
export async function runShutdownHandlers(timeoutMs = DEFAULT_HANDLER_TIMEOUT_MS): Promise<void> {
    for (const handler of handlers) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`shutdown handler timed out after ${timeoutMs}ms`)), timeoutMs);
        });
        try {
            await Promise.race([Promise.resolve().then(handler), timeout]);
        } catch (err) {
            log.error('Shutdown handler error: %s', err);
        } finally {
            clearTimeout(timer);
        }
    }
}

export interface ShutdownOptions {
    /** Longest any one handler may take (default 10 000 ms). */
    handlerTimeoutMs?: number;
}

/**
 * Install SIGINT and SIGTERM handlers. Call this once at bot startup; later
 * calls do nothing. A second signal during shutdown exits immediately.
 */
export function installShutdownHandlers(options: ShutdownOptions = {}): void {
    if (installed) return;
    installed = true;
    const onSignal = (signal: NodeJS.Signals): void => {
        if (shuttingDown) {
            log.warn('Received %s again, exiting without waiting for cleanup', signal);
            process.exit(1);
        }
        shuttingDown = true;
        log.info('Received %s — shutting down gracefully…', signal);
        void runShutdownHandlers(options.handlerTimeoutMs).then(() => process.exit(0));
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
}
