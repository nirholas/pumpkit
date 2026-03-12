/**
 * PumpFun Claim Bot — Track Store
 *
 * In-memory store for tracked tokens and X handles.
 * Persisted to a local JSON file so tracking survives restarts.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { log } from './logger.js';
import type { TrackedItem, TrackType } from './types.js';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const DATA_FILE = join(DATA_DIR, 'tracked.json');

// ============================================================================
// In-memory store
// ============================================================================

const tracked = new Map<string, TrackedItem>();

// ============================================================================
// Persistence
// ============================================================================

function ensureDataDir(): void {
    if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true });
    }
}

export function loadTracked(): void {
    try {
        ensureDataDir();
        if (!existsSync(DATA_FILE)) {
            log.info('No existing tracking data found — starting fresh');
            return;
        }
        const raw = readFileSync(DATA_FILE, 'utf-8');
        const entries: TrackedItem[] = JSON.parse(raw);
        for (const entry of entries) {
            tracked.set(entry.id, entry);
        }
        log.info('Loaded %d tracked items from disk', entries.length);
    } catch (err) {
        log.warn('Failed to load tracked items: %s', err);
    }
}

function saveTracked(): void {
    try {
        ensureDataDir();
        const entries = Array.from(tracked.values());
        writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), 'utf-8');
    } catch (err) {
        log.error('Failed to save tracked items: %s', err);
    }
}

// ============================================================================
// CRUD
// ============================================================================

let idCounter = Date.now();

export function addTrackedItem(
    chatId: number,
    addedBy: number,
    type: TrackType,
    value: string,
    label?: string,
): TrackedItem {
    const id = `t_${++idCounter}`;
    const entry: TrackedItem = {
        addedBy,
        chatId,
        createdAt: Date.now(),
        id,
        label,
        type,
        value: value.trim(),
    };
    tracked.set(id, entry);
    saveTracked();
    log.info('Tracked: %s → %s:%s (chat %d)', id, type, value, chatId);
    return entry;
}

export function removeTrackedItem(id: string, chatId: number): boolean {
    const entry = tracked.get(id);
    if (!entry || entry.chatId !== chatId) return false;
    tracked.delete(id);
    saveTracked();
    log.info('Untracked: %s', id);
    return true;
}

export function removeTrackedByValue(value: string, chatId: number): boolean {
    const lower = value.toLowerCase();
    for (const [id, entry] of tracked) {
        if (entry.value.toLowerCase() === lower && entry.chatId === chatId) {
            tracked.delete(id);
            saveTracked();
            log.info('Untracked by value: %s (%s)', id, value);
            return true;
        }
    }
    return false;
}

export function getTrackedForChat(chatId: number): TrackedItem[] {
    return Array.from(tracked.values()).filter((t) => t.chatId === chatId);
}

export function getTrackedTokensForChat(chatId: number): TrackedItem[] {
    return Array.from(tracked.values()).filter(
        (t) => t.chatId === chatId && t.type === 'token',
    );
}

export function getTrackedXHandlesForChat(chatId: number): TrackedItem[] {
    return Array.from(tracked.values()).filter(
        (t) => t.chatId === chatId && t.type === 'xhandle',
    );
}

/** Get all tracked token mints across all chats. */
export function getAllTrackedTokenMints(): Set<string> {
    const mints = new Set<string>();
    for (const entry of tracked.values()) {
        if (entry.type === 'token') {
            mints.add(entry.value.toLowerCase());
        }
    }
    return mints;
}

/** Get all tracked X handles across all chats (lowercase, no @). */
export function getAllTrackedXHandles(): Set<string> {
    const handles = new Set<string>();
    for (const entry of tracked.values()) {
        if (entry.type === 'xhandle') {
            handles.add(entry.value.toLowerCase().replace(/^@/, ''));
        }
    }
    return handles;
}

/** Find all tracked items that match a given token mint. */
export function findMatchingTokenTracks(mint: string): TrackedItem[] {
    const lower = mint.toLowerCase();
    return Array.from(tracked.values()).filter(
        (t) => t.type === 'token' && t.value.toLowerCase() === lower,
    );
}

/** Find all tracked items that match a given X handle (for creator lookup). */
export function findMatchingXHandleTracks(handle: string): TrackedItem[] {
    const lower = handle.toLowerCase().replace(/^@/, '');
    return Array.from(tracked.values()).filter(
        (t) => t.type === 'xhandle' && t.value.toLowerCase().replace(/^@/, '') === lower,
    );
}

/** Check if a value is already tracked in a chat. */
export function isAlreadyTracked(value: string, chatId: number): boolean {
    const lower = value.toLowerCase().replace(/^@/, '');
    return Array.from(tracked.values()).some(
        (t) =>
            t.chatId === chatId &&
            t.value.toLowerCase().replace(/^@/, '') === lower,
    );
}
