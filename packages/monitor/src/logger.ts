// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

/**
 * PumpFun Telegram Bot — Logger
 *
 * Simple leveled logger wrapping console. Uses node:util format() so printf-style
 * placeholders (%s, %d, %i, %f, %o) in messages interpolate their args correctly.
 * Note: util.format does NOT support precision specifiers like %.2f — pre-format
 * numbers with .toFixed(n) at the call site and use %s.
 */

import { format } from 'node:util';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
    currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
    return LEVELS[level] >= LEVELS[currentLevel];
}

function ts(): string {
    return new Date().toISOString();
}

export const log = {
    debug(msg: string, ...args: unknown[]): void {
        if (shouldLog('debug')) console.debug(`[${ts()}] [DEBUG] ${format(msg, ...args)}`);
    },
    error(msg: string, ...args: unknown[]): void {
        if (shouldLog('error')) console.error(`[${ts()}] [ERROR] ${format(msg, ...args)}`);
    },
    info(msg: string, ...args: unknown[]): void {
        if (shouldLog('info')) console.info(`[${ts()}] [INFO] ${format(msg, ...args)}`);
    },
    warn(msg: string, ...args: unknown[]): void {
        if (shouldLog('warn')) console.warn(`[${ts()}] [WARN] ${format(msg, ...args)}`);
    },
};
