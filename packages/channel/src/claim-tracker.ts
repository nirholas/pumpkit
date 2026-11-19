// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

/**
 * PumpFun Channel Bot — Claim Tracker
 *
 * Tracks claim history per wallet+token to show "first claim"
 * vs "claim #N" and total claimed amounts in the channel feed.
 *
 * Persists wallet first-claim sets to disk so restarts don't
 * re-alert on already-seen wallets.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { log } from '@pumpkit/core/logger';

export interface ClaimRecord {
    /** Total number of claims by this wallet for this token */
    claimCount: number;
    /** Total SOL claimed so far */
    totalClaimedSol: number;
    /** Timestamp of the first claim (unix seconds) */
    firstClaimTimestamp: number;
    /** Timestamp of the most recent claim (unix seconds) */
    lastClaimTimestamp: number;
    /** Price snapshot at claim time */
    claimPriceSol: number;
    claimPriceUsd: number;
    claimMcapUsd: number;
    claimCurveProgress: number;
}

/** Key: "wallet:mint" */
const claimHistory = new Map<string, ClaimRecord>();

/** Tracks which tokens have had ANY claim (key: mint) */
const tokenFirstClaim = new Set<string>();

/** Tracks which wallets have ever claimed (key: wallet address) */
const walletFirstClaim = new Set<string>();

/** Tracks which (githubUser, mint) pairs have been seen — key: "githubId:mint", or "githubId" without a mint */
const githubUserTokenClaims = new Set<string>();

/** Tracks how many times each GitHub user ID has claimed (persisted) */
const githubUserClaimCounts = new Map<string, number>();

/** Max entries before eviction of oldest */
const MAX_ENTRIES = 50_000;

// ── Persistence ──────────────────────────────────────────────────────────────

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const FIRST_CLAIMS_FILE = join(DATA_DIR, 'first-claims.json');
const WALLET_FIRST_CLAIMS_FILE = join(DATA_DIR, 'wallet-first-claims.json');
/** Older releases stored user+token pairs here; still read so they are not lost. */
const LEGACY_GITHUB_PAIRS_FILE = join(DATA_DIR, 'github-first-claims.json');
const GITHUB_USER_TOKEN_CLAIMS_FILE = join(DATA_DIR, 'github-user-token-claims.json');
const GITHUB_CLAIM_COUNTS_FILE = join(DATA_DIR, 'github-claim-counts.json');
const SAVE_DEBOUNCE_MS = 5_000;

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function readJson(file: string): unknown {
    if (!existsSync(file)) return undefined;
    try {
        return JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
        log.warn('Ignoring unreadable %s: %s', file, err);
        return undefined;
    }
}

function loadStrings(file: string, into: Set<string>, label: string): void {
    const data = readJson(file);
    if (!Array.isArray(data)) return;
    for (const item of data) if (typeof item === 'string') into.add(item);
    log.info('Loaded %d persisted %s', into.size, label);
}

/** Write via a temp file and rename, so a crash mid-write cannot leave half a JSON file. */
function writeJsonAtomic(file: string, data: unknown): void {
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(data), 'utf8');
    renameSync(tmp, file);
}

function newest<T>(items: Iterable<T>): T[] {
    const arr = [...items];
    return arr.length > MAX_ENTRIES ? arr.slice(arr.length - MAX_ENTRIES) : arr;
}

/** Drop the oldest entries of an insertion-ordered set or map beyond MAX_ENTRIES. */
function trim(collection: Set<string> | Map<string, unknown>): void {
    while (collection.size > MAX_ENTRIES) {
        const oldest = collection.keys().next().value;
        if (oldest === undefined) return;
        collection.delete(oldest);
    }
}

/** Load persisted first-claim sets from disk on startup. Each file loads independently. */
export function loadPersistedClaims(): void {
    try {
        mkdirSync(DATA_DIR, { recursive: true });
    } catch (err) {
        log.warn('Cannot create data directory %s: %s', DATA_DIR, err);
    }
    loadStrings(FIRST_CLAIMS_FILE, tokenFirstClaim, 'first-claim tokens');
    loadStrings(WALLET_FIRST_CLAIMS_FILE, walletFirstClaim, 'first-claim wallets');
    loadStrings(LEGACY_GITHUB_PAIRS_FILE, githubUserTokenClaims, 'GitHub user+token claim pairs (legacy file)');
    loadStrings(GITHUB_USER_TOKEN_CLAIMS_FILE, githubUserTokenClaims, 'GitHub user+token claim pairs');
    const counts = readJson(GITHUB_CLAIM_COUNTS_FILE);
    if (counts && typeof counts === 'object' && !Array.isArray(counts)) {
        for (const [k, v] of Object.entries(counts)) {
            if (typeof v === 'number') githubUserClaimCounts.set(k, v);
        }
        log.info('Loaded %d persisted GitHub claim counts', githubUserClaimCounts.size);
    }
    trim(githubUserTokenClaims);
    trim(githubUserClaimCounts);
}

/** Write every persisted set to disk now. */
export function persistClaimsNow(): void {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    try {
        mkdirSync(DATA_DIR, { recursive: true });
        const tokens = newest(tokenFirstClaim);
        const wallets = newest(walletFirstClaim);
        const pairs = newest(githubUserTokenClaims);
        writeJsonAtomic(FIRST_CLAIMS_FILE, tokens);
        writeJsonAtomic(WALLET_FIRST_CLAIMS_FILE, wallets);
        writeJsonAtomic(GITHUB_USER_TOKEN_CLAIMS_FILE, pairs);
        writeJsonAtomic(GITHUB_CLAIM_COUNTS_FILE, Object.fromEntries(newest(githubUserClaimCounts)));
        log.debug('Persisted %d first-claim tokens + %d wallets + %d user-token pairs to disk', tokens.length, wallets.length, pairs.length);
    } catch (err) {
        log.warn('Failed to persist claims: %s', err);
    }
}

/** Save first-claim sets to disk (debounced). */
function scheduleSave(): void {
    if (saveTimer) return;
    saveTimer = setTimeout(persistClaimsNow, SAVE_DEBOUNCE_MS);
    saveTimer.unref();
}

// ── Public API ───────────────────────────────────────────────────────────────

function makeKey(wallet: string, mint: string): string {
    return `${wallet}:${mint}`;
}

export interface ClaimPriceSnapshot {
    priceSol: number;
    priceUsd: number;
    mcapUsd: number;
    curveProgress: number;
}

/**
 * Record a new claim and return the updated record.
 * Returns the state AFTER recording (so claimCount=1 means first-ever claim).
 */
export function recordClaim(
    wallet: string,
    mint: string,
    amountSol: number,
    timestamp: number,
    priceSnapshot?: ClaimPriceSnapshot,
): ClaimRecord {
    const key = makeKey(wallet, mint);
    const existing = claimHistory.get(key);

    if (existing) {
        existing.claimCount++;
        existing.totalClaimedSol += amountSol;
        existing.lastClaimTimestamp = timestamp;
        return { ...existing };
    }

    const record: ClaimRecord = {
        claimCount: 1,
        totalClaimedSol: amountSol,
        firstClaimTimestamp: timestamp,
        lastClaimTimestamp: timestamp,
        claimPriceSol: priceSnapshot?.priceSol ?? 0,
        claimPriceUsd: priceSnapshot?.priceUsd ?? 0,
        claimMcapUsd: priceSnapshot?.mcapUsd ?? 0,
        claimCurveProgress: priceSnapshot?.curveProgress ?? 0,
    };
    claimHistory.set(key, record);

    // Evict oldest entries if over limit
    if (claimHistory.size > MAX_ENTRIES) {
        let oldest = '';
        let oldestTime = Infinity;
        for (const [k, v] of claimHistory) {
            if (v.lastClaimTimestamp < oldestTime) {
                oldestTime = v.lastClaimTimestamp;
                oldest = k;
            }
        }
        if (oldest) claimHistory.delete(oldest);
    }

    return { ...record };
}

/** Get claim history for a wallet+token without recording. */
export function getClaimRecord(wallet: string, mint: string): ClaimRecord | null {
    return claimHistory.get(makeKey(wallet, mint)) ?? null;
}

/**
 * Returns true if this is the first-ever claim on this token (any wallet).
 * Marks the token as claimed so subsequent calls return false.
 */
export function isFirstClaimOnToken(mint: string): boolean {
    if (tokenFirstClaim.has(mint)) return false;
    tokenFirstClaim.add(mint);
    scheduleSave();
    // Evict oldest if over limit
    if (tokenFirstClaim.size > MAX_ENTRIES) {
        const first = tokenFirstClaim.values().next().value;
        if (first) tokenFirstClaim.delete(first);
    }
    return true;
}

/**
 * Returns true if this is the first-ever claim by this wallet (any token).
 * Marks the wallet as seen so subsequent calls return false.
 */
export function isFirstClaimByWallet(wallet: string): boolean {
    if (walletFirstClaim.has(wallet)) return false;
    walletFirstClaim.add(wallet);
    scheduleSave();
    if (walletFirstClaim.size > MAX_ENTRIES) {
        const first = walletFirstClaim.values().next().value;
        if (first) walletFirstClaim.delete(first);
    }
    return true;
}

/**
 * Check if this GitHub user has already claimed a specific token.
 * Tracked per user+mint so claiming coin A doesn't affect coin B.
 */
export function hasGithubUserClaimed(githubUserId: string, mint?: string): boolean {
    const key = mint ? `${githubUserId}:${mint}` : githubUserId;
    return githubUserTokenClaims.has(key);
}

/** Mark a GitHub user as having claimed a specific token. */
export function markGithubUserClaimed(githubUserId: string, mint?: string): void {
    const key = mint ? `${githubUserId}:${mint}` : githubUserId;
    if (githubUserTokenClaims.has(key)) return;
    githubUserTokenClaims.add(key);
    trim(githubUserTokenClaims);
    scheduleSave();
}

/** Total unique wallet+token pairs tracked. */
export function getTrackedCount(): number {
    return claimHistory.size;
}

/** Increment and return the claim count for a GitHub user on a specific token. */
export function incrementGithubClaimCount(githubUserId: string, mint?: string): number {
    const key = mint ? `${githubUserId}:${mint}` : githubUserId;
    const count = (githubUserClaimCounts.get(key) ?? 0) + 1;
    githubUserClaimCounts.delete(key);
    githubUserClaimCounts.set(key, count);
    trim(githubUserClaimCounts);
    scheduleSave();
    return count;
}

/** Get the claim count for a GitHub user on a specific token without incrementing. */
export function getGithubClaimCount(githubUserId: string, mint?: string): number {
    const key = mint ? `${githubUserId}:${mint}` : githubUserId;
    return githubUserClaimCounts.get(key) ?? 0;
}

/** Return all mints that a GitHub user has previously claimed fees from. */
export function getGithubUserClaimedMints(githubUserId: string): string[] {
    const prefix = `${githubUserId}:`;
    const mints: string[] = [];
    for (const key of githubUserTokenClaims) {
        if (key.startsWith(prefix)) {
            mints.push(key.slice(prefix.length));
        }
    }
    return mints;
}

