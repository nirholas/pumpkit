// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

/**
 * PumpFun Channel Bot — Event Monitor
 *
 * Monitors the Pump program for on-chain events:
 *   - Token launches (CreateEvent, CreateV2Event)
 *   - Graduation (CompleteEvent, CompletePumpAmmMigrationEvent)
 *   - Whale trades (TradeEvent above a SOL threshold)
 *   - Fee distributions (DistributeCreatorFeesEvent)
 *
 * Events are decoded from "Program data:" log lines (Anchor CPI self-invoke).
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

import type { ChannelBotConfig } from './config.js';
import { log } from './logger.js';
import { RpcFallback } from './rpc-fallback.js';
import type {
    FeeDistributionEvent,
    GraduationEvent,
    TokenLaunchEvent,
    TradeAlertEvent,
} from './types.js';
import {
    COMPLETE_EVENT_DISCRIMINATOR,
    COMPLETE_AMM_MIGRATION_DISCRIMINATOR,
    CREATE_V2_DISCRIMINATOR,
    CREATE_DISCRIMINATOR,
    DEFAULT_GRADUATION_SOL_THRESHOLD,
    PUMP_PROGRAM_ID,
    TRADE_EVENT_DISCRIMINATOR,
} from './types.js';

// ============================================================================
// Constants
// ============================================================================

const DISTRIBUTE_FEES_EVENT_DISCRIMINATOR = 'a537817004b3ca28';
const MAX_WS_ERRORS = 5;
const DEFAULT_TOKEN_TOTAL_SUPPLY = 1_000_000_000_000_000;
const WS_HEARTBEAT_INTERVAL_MS = 60_000;
const WS_HEARTBEAT_TIMEOUT_MS = 90_000;

// ============================================================================
// Event Monitor
// ============================================================================

export class EventMonitor {
    private rpc: RpcFallback;
    private wsConnection?: Connection;
    private config: ChannelBotConfig;
    private programPubkey: PublicKey;

    private onLaunch: (event: TokenLaunchEvent) => void;
    private onGraduation: (event: GraduationEvent) => void;
    private onWhale: (event: TradeAlertEvent) => void;
    private onFeeDistribution: (event: FeeDistributionEvent) => void;

    private pollTimer?: ReturnType<typeof setInterval>;
    private wsSubscriptionId?: number;
    private lastSignature: string | undefined;
    private processedSignatures = new Set<string>();
    private readonly MAX_PROCESSED_CACHE = 10_000;
    private wsErrorCount = 0;
    private stopped = false;
    private isRunning = false;
    private lastWsEventTime = 0;
    private wsHeartbeatTimer?: ReturnType<typeof setInterval>;

    constructor(
        config: ChannelBotConfig,
        onLaunch: (event: TokenLaunchEvent) => void,
        onGraduation: (event: GraduationEvent) => void,
        onWhale: (event: TradeAlertEvent) => void,
        onFeeDistribution: (event: FeeDistributionEvent) => void,
    ) {
        this.config = config;
        this.onLaunch = onLaunch;
        this.onGraduation = onGraduation;
        this.onWhale = onWhale;
        this.onFeeDistribution = onFeeDistribution;
        this.rpc = new RpcFallback(config.solanaRpcUrls, {
            commitment: 'confirmed',
        });
        if (config.solanaRpcUrls.length > 1) {
            log.info('Event monitor: %d RPC endpoints configured (fallback enabled)', config.solanaRpcUrls.length);
        }
        this.programPubkey = new PublicKey(PUMP_PROGRAM_ID);
    }

    async start(): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;

        if (this.config.solanaWsUrl && process.env.SOLANA_WS_URL) {
            try {
                await this.startWebSocket();
                log.info('Event monitor: WebSocket mode');
                return;
            } catch (err) {
                log.warn('Event monitor WS failed, falling back to polling:', err);
            }
        }

        this.startPolling();
        log.info('Event monitor: polling mode (every %ds)', this.config.pollIntervalSeconds);
    }

    stop(): void {
        this.stopped = true;
        this.isRunning = false;
        if (this.wsHeartbeatTimer) {
            clearInterval(this.wsHeartbeatTimer);
            this.wsHeartbeatTimer = undefined;
        }
        if (this.wsConnection && this.wsSubscriptionId !== undefined) {
            this.wsConnection.removeOnLogsListener(this.wsSubscriptionId).catch(() => {});
        }
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = undefined;
        }
    }

    // ── WebSocket ────────────────────────────────────────────────────

    private async startWebSocket(): Promise<void> {
        this.wsConnection = new Connection(this.rpc.currentUrl, {
            commitment: 'confirmed',
            wsEndpoint: this.config.solanaWsUrl,
        });

        this.lastWsEventTime = Date.now();

        this.wsSubscriptionId = this.wsConnection.onLogs(
            this.programPubkey,
            async (logInfo: Logs) => {
                this.lastWsEventTime = Date.now();
                try { await this.handleLogEvent(logInfo); }
                catch (err) { log.error('Event log error:', err); }
            },
            'confirmed',
        );

        // Heartbeat: if no event received for too long, reconnect
        this.wsHeartbeatTimer = setInterval(() => {
            if (this.stopped) return;
            const elapsed = Date.now() - this.lastWsEventTime;
            if (elapsed > WS_HEARTBEAT_TIMEOUT_MS) {
                log.warn('Event monitor WS silent for %ds — reconnecting...', Math.floor(elapsed / 1000));
                this.reconnectWebSocket();
            }
        }, WS_HEARTBEAT_INTERVAL_MS);
    }

    private reconnectWebSocket(): void {
        if (this.stopped) return;
        // Clean up old connection
        if (this.wsConnection && this.wsSubscriptionId !== undefined) {
            this.wsConnection.removeOnLogsListener(this.wsSubscriptionId).catch(() => {});
        }
        this.wsSubscriptionId = undefined;
        this.wsConnection = undefined;

        // Attempt to reconnect
        this.startWebSocket().catch((err) => {
            log.warn('Event monitor WS reconnect failed, falling back to polling: %s', err);
            if (this.wsHeartbeatTimer) {
                clearInterval(this.wsHeartbeatTimer);
                this.wsHeartbeatTimer = undefined;
            }
            this.startPolling();
        });
    }

    private async handleLogEvent(logInfo: Logs, blockTime?: number | null): Promise<void> {
        const { signature, logs: logLines, err } = logInfo;
        if (err) return;
        if (this.processedSignatures.has(signature)) return;
        this.processedSignatures.add(signature);
        this.trimCache();

        for (const line of logLines) {
            if (!line.includes('Program data:')) continue;
            const b64 = line.split('Program data: ')[1]?.trim();
            if (!b64) continue;

            try {
                const bytes = Buffer.from(b64, 'base64');
                if (bytes.length < 8) continue;
                const disc = Buffer.from(bytes.subarray(0, 8)).toString('hex');

                if (disc === CREATE_V2_DISCRIMINATOR || disc === CREATE_DISCRIMINATOR) {
                    this.decodeLaunch(bytes, signature);
                } else if (disc === COMPLETE_EVENT_DISCRIMINATOR || disc === COMPLETE_AMM_MIGRATION_DISCRIMINATOR) {
                    this.decodeGraduation(bytes, disc, signature, blockTime);
                } else if (disc === TRADE_EVENT_DISCRIMINATOR) {
                    this.decodeTrade(bytes, signature);
                } else if (disc === DISTRIBUTE_FEES_EVENT_DISCRIMINATOR) {
                    this.decodeFeeDistribution(bytes, signature);
                }
            } catch (err) {
                log.debug('Malformed log line in %s: %s', signature.slice(0, 8), err);
            }
        }
    }

    // ── Polling ──────────────────────────────────────────────────────

    private startPolling(): void {
        const poll = async () => {
            if (this.stopped) return;
            try {
                const opts: SignaturesForAddressOptions = { limit: 20 };
                if (this.lastSignature) opts.until = this.lastSignature;

                const sigs = await this.rpc.withFallback((conn) => conn.getSignaturesForAddress(this.programPubkey, opts));
                if (sigs.length > 0) this.lastSignature = sigs[0]!.signature;

                for (const sigInfo of sigs) {
                    if (sigInfo.err) continue;
                    if (this.processedSignatures.has(sigInfo.signature)) continue;
                    this.processedSignatures.add(sigInfo.signature);
                    await this.fetchAndProcessLogs(sigInfo.signature);
                }
                this.trimCache();
            } catch (err) {
                log.error('Event poll error:', err);
            }

            if (!this.stopped) {
                this.pollTimer = setTimeout(poll, this.config.pollIntervalSeconds * 1000);
            }
        };
        poll();
    }

    private async fetchAndProcessLogs(signature: string): Promise<void> {
        try {
            const tx = await this.rpc.withFallback((conn) => conn.getParsedTransaction(signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0,
            }));
            if (!tx?.meta || tx.meta.err) return;

            const logMessages = tx.meta.logMessages ?? [];
            await this.handleLogEvent({
                signature,
                logs: logMessages,
                err: null,
            }, tx.blockTime);
        } catch (err) {
            log.debug('Failed to fetch tx %s: %s', signature.slice(0, 8), err);
        }
    }

    // ── Decoders ─────────────────────────────────────────────────────

    private decodeLaunch(bytes: Buffer, signature: string): void {
        try {
            const ev = PUMP_SDK.decodeCreateEvent(bytes);
            const githubUrls = extractGithubUrlsFromString(`${ev.name} ${ev.symbol} ${ev.uri}`);
            const creator = ev.creator.toBase58();
            const user = ev.user.toBase58();

            const event: TokenLaunchEvent = {
                txSignature: signature,
                slot: 0,
                timestamp: Number(ev.timestamp),
                mintAddress: ev.mint.toBase58(),
                creatorWallet: creator || user,
                name: ev.name,
                symbol: ev.symbol,
                description: '',
                metadataUri: ev.uri,
                hasGithub: githubUrls.length > 0,
                githubUrls,
                mayhemMode: ev.isMayhemMode,
                cashbackEnabled: ev.isCashbackEnabled,
            };

            this.onLaunch(event);
        } catch (err) {
            log.debug('Launch decode error: %s', err);
        }
    }

    private decodeGraduation(bytes: Buffer, disc: string, signature: string, blockTime?: number | null): void {
        try {
            const isMigration = disc === COMPLETE_AMM_MIGRATION_DISCRIMINATOR;

            if (isMigration) {
                const ev = PUMP_SDK.decodeCompletePumpAmmMigrationEvent(bytes);
                const event: GraduationEvent = {
                    txSignature: signature,
                    slot: 0,
                    timestamp: Number(ev.timestamp) || (blockTime ?? Math.floor(Date.now() / 1000)),
                    mintAddress: ev.mint.toBase58(),
                    user: ev.user.toBase58(),
                    bondingCurve: ev.bondingCurve.toBase58(),
                    isMigration: true,
                    poolAddress: ev.pool.toBase58(),
                    solAmount: Number(ev.solAmount) / LAMPORTS_PER_SOL,
                    mintAmount: Number(ev.mintAmount),
                    poolMigrationFee: Number(ev.poolMigrationFee) / LAMPORTS_PER_SOL,
                };
                this.onGraduation(event);
            } else {
                const ev = PUMP_SDK.decodeCompleteEvent(bytes);
                const event: GraduationEvent = {
                    txSignature: signature,
                    slot: 0,
                    timestamp: Number(ev.timestamp) || (blockTime ?? Math.floor(Date.now() / 1000)),
                    mintAddress: ev.mint.toBase58(),
                    user: ev.user.toBase58(),
                    bondingCurve: ev.bondingCurve.toBase58(),
                    isMigration: false,
                };
                this.onGraduation(event);
            }
        } catch (err) {
            log.debug('Graduation decode error: %s', err);
        }
    }

    private decodeTrade(bytes: Buffer, signature: string): void {
        try {
            const ev = PUMP_SDK.decodeTradeEvent(bytes);
            const solAmount = Number(ev.solAmount) / LAMPORTS_PER_SOL;

            if (solAmount < this.config.whaleThresholdSol) return;

            const virtualSolReserves = Number(ev.virtualSolReserves);
            const virtualTokenReserves = Number(ev.virtualTokenReserves);
            const realSolReserves = Number(ev.realSolReserves);

            const marketCapSol = virtualTokenReserves > 0
                ? (virtualSolReserves * DEFAULT_TOKEN_TOTAL_SUPPLY) / (virtualTokenReserves * LAMPORTS_PER_SOL)
                : 0;

            const bondingCurveProgress = realSolReserves > 0
                ? Math.min(100, (realSolReserves / LAMPORTS_PER_SOL) / DEFAULT_GRADUATION_SOL_THRESHOLD * 100)
                : 0;

            const event: TradeAlertEvent = {
                txSignature: signature,
                slot: 0,
                timestamp: Number(ev.timestamp),
                mintAddress: ev.mint.toBase58(),
                user: ev.user.toBase58(),
                creator: ev.creator.toBase58(),
                isBuy: ev.isBuy,
                solAmount,
                tokenAmount: Number(ev.tokenAmount),
                fee: Number(ev.fee) / LAMPORTS_PER_SOL,
                creatorFee: Number(ev.creatorFee) / LAMPORTS_PER_SOL,
                virtualSolReserves,
                virtualTokenReserves,
                realSolReserves,
                realTokenReserves: Number(ev.realTokenReserves),
                mayhemMode: ev.mayhemMode,
                marketCapSol,
                bondingCurveProgress,
            };

            this.onWhale(event);
        } catch (err) {
            log.debug('Trade decode error: %s', err);
        }
    }

    private decodeFeeDistribution(bytes: Buffer, signature: string): void {
        try {
            const ev = PUMP_SDK.decodeDistributeCreatorFeesEvent(bytes);
            const timestamp = Number(ev.timestamp);

            const event: FeeDistributionEvent = {
                txSignature: signature,
                slot: 0,
                timestamp: timestamp || Math.floor(Date.now() / 1000),
                mintAddress: ev.mint.toBase58(),
                // bondingCurve is a V2 field the runtime decoder emits but the 1.30.0
                // TS type omits — cast to read, falling back to sharingConfig.
                bondingCurve: (ev as { bondingCurve?: { toBase58(): string } }).bondingCurve?.toBase58() ?? ev.sharingConfig.toBase58(),
                admin: ev.admin.toBase58(),
                distributedSol: Number(ev.distributed) / LAMPORTS_PER_SOL,
                shareholders: ev.shareholders.map((sh) => ({
                    address: sh.address.toBase58(),
                    shareBps: sh.shareBps,
                })),
            };

            this.onFeeDistribution(event);
        } catch (err) {
            log.debug('Fee distribution decode error: %s', err);
        }
    }

    private trimCache(): void {
        if (this.processedSignatures.size > this.MAX_PROCESSED_CACHE) {
            // Keep the most recent entries (Sets are insertion-ordered in JS)
            const arr = [...this.processedSignatures];
            this.processedSignatures = new Set(arr.slice(-5_000));
        }
    }
}

// ============================================================================
// Helpers
// ============================================================================

const GITHUB_RE = /https?:\/\/github\.com\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)?/gi;

function extractGithubUrlsFromString(text: string): string[] {
    if (!text) return [];
    const matches = text.match(GITHUB_RE);
    if (!matches) return [];
    return [...new Set(matches)];
}
