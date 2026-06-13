// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

/**
 * PumpFun Channel Bot — Solana Fee Claim Monitor
 *
 * Monitors both Pump and PumpSwap programs for fee claim transactions.
 * Two modes: WebSocket (real-time) or HTTP polling (fallback).
 */

import { PUMP_SDK } from '@nirholas/pump-sdk';
import {
    Connection,
    LAMPORTS_PER_SOL,
    PublicKey,
    type Logs,
    type SignaturesForAddressOptions,
} from '@solana/web3.js';
import bs58 from 'bs58';

import type { ChannelBotConfig } from './config.js';
import { log } from './logger.js';
import { RpcFallback } from './rpc-fallback.js';
import {
    SocialFeeIndex,
    CREATE_FEE_SHARING_CONFIG_EVENT_DISC,
    UPDATE_FEE_SHARES_EVENT_DISC,
} from './social-fee-index.js';
import type { FeeClaimEvent, ClaimType } from './types.js';
import {
    CLAIM_INSTRUCTIONS,
    PUMP_PROGRAM_ID,
    PUMP_AMM_PROGRAM_ID,
    PUMP_FEE_PROGRAM_ID,
    WSOL_MINT,
    QUOTE_MINT_INFO,
    type InstructionDef,
} from './types.js';

interface QuoteInfo { ticker: string; decimals: number; isStable: boolean }

/**
 * Quote-currency metadata for a given quote mint. Defaults to SOL for unknown
 * mints, which preserves exact V1 behavior. This replaces a helper that was
 * imported from @nirholas/pump-sdk but never actually published there — the
 * data already lives locally in QUOTE_MINT_INFO (types.ts).
 */
function getQuoteInfo(quoteMint: PublicKey): QuoteInfo {
    return QUOTE_MINT_INFO[quoteMint.toBase58()] ?? QUOTE_MINT_INFO[WSOL_MINT]!;
}

// ============================================================================
// Rate limiter
// ============================================================================

const MAX_CONCURRENCY = 1;
const MIN_REQUEST_INTERVAL_MS = 1_000;
const MAX_QUEUE_SIZE = 50;
const RATE_LIMIT_LOG_WINDOW_MS = 30_000;
const WS_HEARTBEAT_INTERVAL_MS = 60_000;
const WS_HEARTBEAT_TIMEOUT_MS = 90_000;
// If no RPC read succeeds for this long, the feed is effectively dead (exhausted
// RPC key, sustained 429s, dead websocket). We surface this as `degraded` on the
// health endpoint (→ 503) and log loudly, instead of sitting silently online.
// These programs are high-traffic, so a healthy feed reads continuously; minutes
// of total silence means the chain connection is broken, not just quiet.
const DEGRADED_AFTER_MS = 300_000; // 5 min
const LIVENESS_CHECK_INTERVAL_MS = 60_000;

class RpcQueue {
    private queue: string[] = [];
    private inFlight = 0;
    private processing = false;
    private lastRequestTime = 0;
    private last429LogTime = 0;
    private dropped429Count = 0;
    private processFn: (sig: string) => Promise<void>;

    constructor(processFn: (sig: string) => Promise<void>) {
        this.processFn = processFn;
    }

    enqueue(signature: string): boolean {
        if (this.queue.length >= MAX_QUEUE_SIZE) return false;
        this.queue.push(signature);
        this.drain();
        return true;
    }

    note429(): void {
        this.dropped429Count++;
        const now = Date.now();
        if (now - this.last429LogTime >= RATE_LIMIT_LOG_WINDOW_MS) {
            log.warn('RPC 429 — %d in last %ds', this.dropped429Count, RATE_LIMIT_LOG_WINDOW_MS / 1000);
            this.dropped429Count = 0;
            this.last429LogTime = now;
        }
    }

    private async drain(): Promise<void> {
        if (this.processing) return;
        this.processing = true;
        while (this.queue.length > 0 && this.inFlight < MAX_CONCURRENCY) {
            const elapsed = Date.now() - this.lastRequestTime;
            if (elapsed < MIN_REQUEST_INTERVAL_MS) {
                await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
            }
            const sig = this.queue.shift();
            if (!sig) break;
            this.lastRequestTime = Date.now();
            this.inFlight++;
            this.processFn(sig)
                .catch((err) => { log.debug('RPC queue item failed: %s', err); })
                .finally(() => { this.inFlight--; this.drain(); });
        }
        this.processing = false;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function formatUptime(ms: number): string {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
}

// ============================================================================
// Monitor
// ============================================================================

export class ClaimMonitor {
    private rpc: RpcFallback;
    private wsConnection?: Connection;
    private config: ChannelBotConfig;
    private onClaim: (event: FeeClaimEvent) => void;
    private pollTimer?: ReturnType<typeof setInterval>;
    private wsSubscriptionIds: number[] = [];
    private lastSignatures = new Map<string, string | undefined>();
    private programPubkeys: PublicKey[];
    private processedSignatures = new Set<string>();
    private readonly MAX_PROCESSED_CACHE = 10_000;
    private rpcQueue: RpcQueue;
    private consecutive429s = 0;
    private isRunning = false;
    private startedAt = 0;
    private claimsDetected = 0;
    private lastWsEventTime = 0;
    private wsHeartbeatTimer?: ReturnType<typeof setInterval>;
    private livenessTimer?: ReturnType<typeof setInterval>;
    /** Last time ANY RPC read succeeded (WS event, poll, or getTransaction). */
    private lastSuccessfulReadAt = 0;
    /** Set true once we've logged the degraded warning, to avoid spamming. */
    private degradedLogged = false;
    private wsEventsReceived = 0;
    private claimTxProcessed = 0;
    private claimsByType = new Map<string, number>();
    private socialFeeIndex = new SocialFeeIndex();

    constructor(config: ChannelBotConfig, onClaim: (event: FeeClaimEvent) => void) {
        this.config = config;
        this.onClaim = onClaim;
        this.rpc = new RpcFallback(config.solanaRpcUrls, {
            commitment: 'confirmed',
            disableRetryOnRateLimit: true,
        });
        if (config.solanaRpcUrls.length > 1) {
            log.info('Claim monitor: %d RPC endpoints configured (fallback enabled)', config.solanaRpcUrls.length);
        }
        // Monitor all three programs: PumpFees (social fee PDA), Pump (creator fees), PumpAMM (coin creator fees)
        this.programPubkeys = [
            new PublicKey(PUMP_FEE_PROGRAM_ID),
            new PublicKey(PUMP_PROGRAM_ID),
            new PublicKey(PUMP_AMM_PROGRAM_ID),
        ];
        this.rpcQueue = new RpcQueue((sig) => this.processTransaction(sig));
    }

    async start(): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;
        this.startedAt = Date.now();
        this.lastSuccessfulReadAt = Date.now();

        log.info('Claim monitor: monitoring %d programs', this.programPubkeys.length);

        // Liveness watchdog: if the feed goes silent (exhausted RPC key, sustained
        // 429s, dead WS), log loudly and flip the health endpoint to degraded → 503.
        this.livenessTimer = setInterval(() => this.checkLiveness(), LIVENESS_CHECK_INTERVAL_MS);

        // Bootstrap social fee index from on-chain SharingConfig accounts (non-blocking)
        this.socialFeeIndex.bootstrap(this.rpc).catch((err: unknown) => {
            log.warn('SocialFeeIndex bootstrap error: %s', err);
        });

        if (this.config.solanaWsUrl && process.env.SOLANA_WS_URL) {
            try {
                await this.startWebSocket();
                log.info('Claim monitor: WebSocket mode');
                return;
            } catch (err) {
                log.warn('WS failed, falling back to polling:', err);
            }
        }

        this.startPolling();
        log.info('Claim monitor: polling mode (every %ds)', this.config.pollIntervalSeconds);
    }

    stop(): void {
        this.isRunning = false;
        if (this.wsHeartbeatTimer) {
            clearInterval(this.wsHeartbeatTimer);
            this.wsHeartbeatTimer = undefined;
        }
        if (this.livenessTimer) {
            clearInterval(this.livenessTimer);
            this.livenessTimer = undefined;
        }
        if (this.wsConnection) {
            for (const id of this.wsSubscriptionIds) {
                this.wsConnection.removeOnLogsListener(id).catch(() => {});
            }
            this.wsSubscriptionIds = [];
        }
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = undefined;
        }
        log.info('Claim monitor stopped');
    }

    /** Record that an RPC read succeeded — resets the liveness watchdog. */
    private markRead(): void {
        this.lastSuccessfulReadAt = Date.now();
        if (this.degradedLogged) {
            log.info('✅ Claim monitor RECOVERED — RPC reads flowing again.');
            this.degradedLogged = false;
        }
    }

    /** True when no RPC read has succeeded for DEGRADED_AFTER_MS while running. */
    isDegraded(): boolean {
        if (!this.isRunning || this.lastSuccessfulReadAt === 0) return false;
        return Date.now() - this.lastSuccessfulReadAt > DEGRADED_AFTER_MS;
    }

    /** Watchdog tick: log loudly when the feed has gone silent. */
    private checkLiveness(): void {
        if (!this.isRunning) return;
        if (this.isDegraded()) {
            const ago = Math.floor((Date.now() - this.lastSuccessfulReadAt) / 1000);
            log.error(
                '⚠️ Claim monitor DEGRADED — no successful RPC read in %ds (consecutive429s=%d, rpc=%s). ' +
                'Feed is NOT posting — check RPC quota / key.',
                ago, this.consecutive429s, maskRpcUrl(this.rpc.currentUrl),
            );
            this.degradedLogged = true;
        }
    }

    getMetrics(): Record<string, unknown> {
        return {
            claimsDetected: this.claimsDetected,
            processedSignatures: this.processedSignatures.size,
            mode: this.wsSubscriptionIds.length > 0 ? 'websocket' : 'polling',
            rpcEndpoints: this.rpc.size,
            activeRpc: maskRpcUrl(this.rpc.currentUrl),
            uptimeMs: this.startedAt ? Date.now() - this.startedAt : 0,
            degraded: this.isDegraded(),
            consecutive429s: this.consecutive429s,
            lastReadAgoMs: this.lastSuccessfulReadAt ? Date.now() - this.lastSuccessfulReadAt : 0,
        };
    }

    // ── WebSocket ────────────────────────────────────────────────────

    private async startWebSocket(): Promise<void> {
        this.wsConnection = new Connection(this.rpc.currentUrl, {
            commitment: 'confirmed',
            wsEndpoint: this.config.solanaWsUrl,
            disableRetryOnRateLimit: true,
        });

        this.lastWsEventTime = Date.now();

        for (const pubkey of this.programPubkeys) {
            const subId = this.wsConnection.onLogs(
                pubkey,
                async (logInfo: Logs) => {
                    this.lastWsEventTime = Date.now();
                    this.markRead();
                    this.wsEventsReceived++;
                    try { await this.handleLogEvent(logInfo); }
                    catch (err) { log.error('Log event error:', err); }
                },
                'confirmed',
            );
            this.wsSubscriptionIds.push(subId);
        }

        // Heartbeat: if no event for too long, reconnect
        this.wsHeartbeatTimer = setInterval(() => {
            if (!this.isRunning) return;
            const elapsed = Date.now() - this.lastWsEventTime;
            if (elapsed > WS_HEARTBEAT_TIMEOUT_MS) {
                log.warn('Claim monitor WS silent for %ds — reconnecting...', Math.floor(elapsed / 1000));
                this.reconnectWebSocket();
            } else {
                const typeBreakdown = [...this.claimsByType.entries()]
                    .map(([type, count]) => `${type}=${count}`).join(', ');
                log.info('WS heartbeat: %d events, %d claims queued, %d detected [%s] (uptime %s)',
                    this.wsEventsReceived, this.claimTxProcessed, this.claimsDetected,
                    typeBreakdown || 'none',
                    formatUptime(Date.now() - this.startedAt));
            }
        }, WS_HEARTBEAT_INTERVAL_MS);
    }

    private reconnectWebSocket(): void {
        if (!this.isRunning) return;
        // Clean up old connection
        if (this.wsConnection) {
            for (const id of this.wsSubscriptionIds) {
                this.wsConnection.removeOnLogsListener(id).catch(() => {});
            }
            this.wsSubscriptionIds = [];
        }
        this.wsConnection = undefined;

        this.startWebSocket().catch((err) => {
            log.warn('Claim monitor WS reconnect failed, falling back to polling: %s', err);
            if (this.wsHeartbeatTimer) {
                clearInterval(this.wsHeartbeatTimer);
                this.wsHeartbeatTimer = undefined;
            }
            this.startPolling();
        });
    }

    private async handleLogEvent(logInfo: Logs): Promise<void> {
        const { signature, logs, err } = logInfo;
        if (err) return;
        if (this.processedSignatures.has(signature)) return;
        this.processedSignatures.add(signature);
        this.trimProcessedCache();

        // Scan all log lines for relevant events.
        // NOTE: claim_social_fee_pda does NOT emit a CPI event — it returns a
        // SocialFeePdaClaimed struct. Detect it via Anchor's instruction log line
        // instead of a "Program data:" discriminator.
        let hasClaimIx = false;

        for (const line of logs) {
            // Detect claim_social_fee_pda via Anchor instruction log
            if (!hasClaimIx && line.includes('Program log: Instruction: ClaimSocialFeePda')) {
                hasClaimIx = true;
            }

            if (!line.includes('Program data:')) continue;
            const b64 = line.split('Program data: ')[1]?.trim();
            if (!b64) continue;
            try {
                const bytes = Buffer.from(b64, 'base64');
                if (bytes.length < 8) continue;
                const disc = Buffer.from(bytes.subarray(0, 8)).toString('hex');

                if (disc === CREATE_FEE_SHARING_CONFIG_EVENT_DISC) {
                    this.socialFeeIndex.updateFromCreateEvent(bytes);
                } else if (disc === UPDATE_FEE_SHARES_EVENT_DISC) {
                    this.socialFeeIndex.updateFromUpdateSharesEvent(bytes);
                }
            } catch { /* ignore unparseable */ }
        }

        if (hasClaimIx) {
            this.claimTxProcessed++;
            this.rpcQueue.enqueue(signature);
        }
    }

    // ── Polling ──────────────────────────────────────────────────────

    private startPolling(): void {
        const poll = async () => {
            if (!this.isRunning) return;
            try {
                await this.pollAllPrograms();
                this.consecutive429s = 0;
                this.markRead();
            } catch (err) {
                const msg = String(err);
                if (msg.includes('429')) {
                    this.consecutive429s++;
                    this.rpcQueue.note429();
                } else {
                    log.error('Poll error:', err);
                }
            }
            if (this.isRunning) {
                const backoff = Math.min(
                    2 ** this.consecutive429s,
                    8,
                );
                const delay = this.config.pollIntervalSeconds * backoff * 1000;
                this.pollTimer = setTimeout(poll, delay);
            }
        };
        poll();
    }

    private async pollAllPrograms(): Promise<void> {
        for (const pubkey of this.programPubkeys) {
            const programId = pubkey.toBase58();
            const opts: SignaturesForAddressOptions = { limit: 20 };
            const lastSig = this.lastSignatures.get(programId);
            if (lastSig) opts.until = lastSig;

            const sigs = await this.rpc.withFallback((conn) => conn.getSignaturesForAddress(pubkey, opts));
            if (sigs.length === 0) continue;

            this.lastSignatures.set(programId, sigs[0]!.signature);

            for (const sigInfo of sigs) {
                if (sigInfo.err) continue;
                if (this.processedSignatures.has(sigInfo.signature)) continue;
                this.processedSignatures.add(sigInfo.signature);
                this.rpcQueue.enqueue(sigInfo.signature);
            }
        }
        this.trimProcessedCache();
    }

    // ── Transaction Processing ───────────────────────────────────────

    private async processTransaction(signature: string): Promise<void> {
        try {
            const tx = await this.rpc.withFallback((conn) => conn.getParsedTransaction(signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0,
            }));
            this.markRead(); // the getTransaction call itself succeeded
            if (!tx?.meta || tx.meta.err) return;

            const instructions = tx.transaction.message.instructions;
            const timestamp = tx.blockTime ?? Math.floor(Date.now() / 1000);
            const slot = tx.slot;

            // Process all claim instructions (social, creator, distribution — not just social)
            for (const ix of instructions) {
                if (!('data' in ix) || !ix.data) continue;
                const programId = ix.programId.toBase58();
                const matchedDef = this.matchClaimInstruction(ix.data, programId);
                if (!matchedDef) continue;

                const event = this.buildClaimEvent(
                    signature, slot, timestamp, tx, matchedDef, ix,
                );
                if (event) {
                    this.claimsDetected++;
                    const typeCount = (this.claimsByType.get(event.claimType) ?? 0) + 1;
                    this.claimsByType.set(event.claimType, typeCount);
                    this.onClaim(event);
                }
            }
        } catch (err) {
            const msg = String(err);
            if (msg.includes('429')) {
                this.rpcQueue.note429();
            } else {
                log.error('TX processing error %s: %s', signature.slice(0, 8), err);
            }
        }
    }

    private matchClaimInstruction(data: string, programId: string): InstructionDef | undefined {
        try {
            const bytes = bs58.decode(data);
            const disc = Buffer.from(bytes.subarray(0, 8)).toString('hex');
            return CLAIM_INSTRUCTIONS.find(
                (def) => def.discriminator === disc && def.programId === programId,
            );
        } catch {
            return undefined;
        }
    }

    private buildClaimEvent(
        signature: string,
        slot: number,
        timestamp: number,
        tx: import('@solana/web3.js').ParsedTransactionWithMeta,
        def: InstructionDef,
        ix: import('@solana/web3.js').ParsedInstruction | import('@solana/web3.js').PartiallyDecodedInstruction,
    ): FeeClaimEvent | null {
        // Find the claimer from account keys
        const accountKeys = tx.transaction.message.accountKeys;
        const signerKey = accountKeys.find((a) => a.signer)?.pubkey?.toBase58();
        if (!signerKey) return null;

        // Extract token mint based on instruction type
        let tokenMint = '';
        let githubUserId: string | undefined;
        let socialPlatform: number | undefined;
        let recipientWallet: string | undefined;
        let socialFeePda: string | undefined;
        let lifetimeClaimedLamports: number | undefined;
        // `amount_claimed` in V2 events is in base units of the quote mint
        // (lamports for SOL, micro-USDC for USDC, etc.). The SDK decoder
        // surfaces it as `quoteMint`; we default to WSOL when absent.
        let quoteMint: string | undefined;
        let lifetimeClaimedRaw: bigint | undefined;

        if (def.claimType === 'distribute_creator_fees') {
            // distribute_creator_fees: accounts[0] = mint
            if ('accounts' in ix && Array.isArray(ix.accounts) && ix.accounts.length > 0) {
                tokenMint = ix.accounts[0]!.toBase58();
            }
        }
        // collect_creator_fee, claim_cashback, collect_coin_creator_fee
        // are wallet-level claims with no token mint — tokenMint stays empty
        // claim_social_fee_pda: mint is resolved via the SocialFeeIndex below

        // Parse event data from CPI log lines for amount
        let amountLamports = 0;
        const logMessages = tx.meta?.logMessages ?? [];
        for (const line of logMessages) {
            if (!line.includes('Program data:')) continue;
            const b64 = line.split('Program data: ')[1]?.trim();
            if (!b64) continue;
            try {
                const bytes = Buffer.from(b64, 'base64');
                if (bytes.length < 8) continue;
                const disc = Buffer.from(bytes.subarray(0, 8)).toString('hex');

                if (disc === 'a537817004b3ca28' && def.claimType === 'distribute_creator_fees') {
                    const ev = PUMP_SDK.decodeDistributeCreatorFeesEvent(bytes);
                    tokenMint = ev.mint.toBase58();
                    amountLamports = Number(ev.distributed);
                    // quoteMint is a V2 field the runtime decoder emits but the
                    // 1.30.0 TS type omits — cast to read it (see SocialFeePda above).
                    quoteMint = pubkeyToBase58OrUndefined((ev as { quoteMint?: PublicKey }).quoteMint);
                } else if (disc === '7a027f010ebf0caf') {
                    const ev = PUMP_SDK.decodeCollectCreatorFeeEvent(bytes);
                    amountLamports = Number(ev.creatorFee);
                    // V2 field omitted from the 1.30.0 TS type — cast to read.
                    quoteMint = pubkeyToBase58OrUndefined((ev as { quoteMint?: PublicKey }).quoteMint);
                } else if (disc === 'e2d6f62107f293e5') {
                    const ev = PUMP_SDK.decodeClaimCashbackEvent(bytes);
                    amountLamports = Number(ev.amount);
                } else if (disc === 'e8f5c2eeeada3a59') {
                    // CollectCoinCreatorFeeEvent (PumpAMM) — no SDK decoder yet.
                    // Layout: disc(8) + timestamp(8) + coinCreator(32) + coinCreatorFee(8) + …
                    if (bytes.length >= 56) {
                        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
                        amountLamports = Number(view.getBigUint64(48, true));
                    }
                } else if (disc === '3212c141edd2eaec' && def.claimType === 'claim_social_fee_pda') {
                    // SocialFeePdaClaimed — SDK's TS type omits the V2 trailing
                    // quote_mint / lifetime_stable_claimed fields, but the IDL
                    // (and the runtime decoder) include them, so cast to read.
                    const ev = PUMP_SDK.decodeSocialFeePdaClaimedEvent(bytes) as {
                        userId: string;
                        platform: number;
                        socialFeePda: PublicKey;
                        recipient: PublicKey;
                        amountClaimed: { toString(): string };
                        lifetimeClaimed: { toString(): string };
                        quoteMint?: PublicKey;
                    };
                    githubUserId = ev.userId;
                    socialPlatform = ev.platform;
                    socialFeePda = ev.socialFeePda.toBase58();
                    recipientWallet = ev.recipient.toBase58();
                    amountLamports = Number(ev.amountClaimed.toString());
                    lifetimeClaimedRaw = BigInt(ev.lifetimeClaimed.toString());
                    lifetimeClaimedLamports = Number(lifetimeClaimedRaw);
                    quoteMint = pubkeyToBase58OrUndefined(ev.quoteMint);
                }
            } catch { /* skip unparseable log lines */ }
        }

        // Fallback: calculate SOL amount from balance changes
        if (amountLamports === 0) {
            const preBalances = tx.meta?.preBalances ?? [];
            const postBalances = tx.meta?.postBalances ?? [];
            const signerIdx = accountKeys.findIndex(
                (a) => a.pubkey.toBase58() === signerKey,
            );
            if (signerIdx >= 0 && signerIdx < preBalances.length) {
                const diff = (postBalances[signerIdx] ?? 0) - (preBalances[signerIdx] ?? 0);
                if (diff > 0) amountLamports = diff;
            }
        }

        // If still no amount, try inner instructions
        if (amountLamports === 0) {
            const innerIxs = tx.meta?.innerInstructions ?? [];
            for (const inner of innerIxs) {
                for (const innerIx of inner.instructions) {
                    if (
                        'parsed' in innerIx &&
                        innerIx.parsed?.type === 'transfer' &&
                        innerIx.parsed?.info?.destination === signerKey
                    ) {
                        amountLamports = Number(innerIx.parsed.info.lamports ?? 0);
                    }
                }
            }
        }

        // Detect fake claims: claim_social_fee_pda was called but no
        // SocialFeePdaClaimed event was emitted (amount stays 0).
        // Parse user_id and platform from the instruction arguments instead.
        let isFake = false;
        if (def.claimType === 'claim_social_fee_pda' && amountLamports === 0) {
            isFake = true;
            // Try to extract user_id & platform from instruction args
            // Anchor ix data: disc(8) + user_id(borsh string: 4-byte len + N) + platform(u8)
            if ('data' in ix && ix.data && !githubUserId) {
                try {
                    const ixBytes = bs58.decode(ix.data);
                    if (ixBytes.length > 12) {
                        let offset = 8; // skip discriminator
                        const uidLen = Buffer.from(ixBytes.subarray(offset, offset + 4)).readUInt32LE(0);
                        offset += 4;
                        if (uidLen > 0 && uidLen <= 20 && ixBytes.length >= offset + uidLen) {
                            githubUserId = Buffer.from(ixBytes.subarray(offset, offset + uidLen)).toString('utf8');
                            offset += uidLen;
                        }
                        if (ixBytes.length >= offset + 1) {
                            socialPlatform = ixBytes[offset];
                        }
                    }
                } catch { /* ignore parse errors */ }
            }
            // Resolve socialFeePda from instruction accounts
            if ('accounts' in ix && Array.isArray(ix.accounts) && ix.accounts.length >= 2 && !socialFeePda) {
                socialFeePda = ix.accounts[1]?.toBase58();
            }
        }

        // Skip non-social dust amounts (real social claims always emit event data)
        if (!isFake && amountLamports < 1000) return null;

        // For social fee PDA claims, resolve mint from the index.
        // When multiple tokens share the same PDA (scam vector), return all
        // candidates so the caller can disambiguate by market cap.
        let allCandidateMints: string[] | undefined;
        if (def.claimType === 'claim_social_fee_pda' && socialFeePda && !tokenMint) {
            const candidates = this.socialFeeIndex.lookupAll(socialFeePda);
            if (candidates.length === 1) {
                tokenMint = candidates[0]!;
            } else if (candidates.length > 1) {
                allCandidateMints = candidates;
                // Use first as fallback; caller should disambiguate
                tokenMint = candidates[0]!;
            }
        }

        // Resolve quote-currency metadata. Defaults to SOL when the event predates V2 or
        // the quote_mint field couldn't be read; that preserves V1 behavior exactly.
        const resolvedQuoteMint = quoteMint ?? WSOL_MINT;
        const quoteInfo = getQuoteInfo(new PublicKey(resolvedQuoteMint));
        const quoteDivisor = Math.pow(10, quoteInfo.decimals);
        const amountQuote = amountLamports / quoteDivisor;
        const lifetimeClaimedQuote = lifetimeClaimedRaw != null
            ? Number(lifetimeClaimedRaw) / quoteDivisor
            : undefined;
        // amountSol is preserved only when the quote is actually SOL — for USDC claims it
        // would be misleading, so we leave it 0 and downstream code branches on isStableQuote.
        const amountSol = quoteInfo.isStable ? 0 : amountLamports / LAMPORTS_PER_SOL;

        return {
            txSignature: signature,
            slot,
            timestamp,
            claimerWallet: signerKey,
            tokenMint,
            amountSol,
            amountLamports,
            claimType: def.claimType,
            isCashback: !def.isCreatorClaim,
            programId: def.programId,
            claimLabel: def.label,
            githubUserId,
            socialPlatform,
            recipientWallet,
            socialFeePda,
            isFake,
            lifetimeClaimedLamports,
            allCandidateMints,
            quoteMint: resolvedQuoteMint,
            quoteTicker: quoteInfo.ticker,
            isStableQuote: quoteInfo.isStable,
            amountQuote,
            lifetimeClaimedQuote,
        };
    }

    private trimProcessedCache(): void {
        if (this.processedSignatures.size > this.MAX_PROCESSED_CACHE) {
            // Keep the most recent entries (Sets are insertion-ordered in JS)
            const arr = [...this.processedSignatures];
            this.processedSignatures = new Set(arr.slice(-5_000));
        }
    }
}

function maskRpcUrl(url: string): string {
    try {
        const u = new URL(url);
        return u.hostname;
    } catch {
        return url.slice(0, 30);
    }
}

// Returns base58 for a non-default pubkey, or undefined for missing/PublicKey.default —
// the SDK uses `PublicKey.default` to mark V1 (pre-quote-mint) events.
function pubkeyToBase58OrUndefined(pk: PublicKey | undefined): string | undefined {
    if (!pk || pk.equals(PublicKey.default)) return undefined;
    return pk.toBase58();
}

