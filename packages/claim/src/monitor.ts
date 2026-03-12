/**
 * PumpFun Claim Bot — WebSocket Relay Client
 *
 * Connects to the PumpFun WebSocket relay server and listens for
 * fee-claim events. No direct Solana RPC connection needed — the relay
 * handles all on-chain monitoring and broadcasts parsed events.
 *
 * Auto-reconnects on disconnect with exponential backoff.
 */

import WebSocket from 'ws';

import type { BotConfig, FeeClaimEvent } from './types.js';
import { log } from './logger.js';

// ============================================================================
// Relay message types (subset — we only care about fee-claim and status)
// ============================================================================

interface RelayFeeClaimMessage {
    type: 'fee-claim';
    txSignature: string;
    slot: number;
    timestamp: number;
    claimerWallet: string;
    tokenMint: string;
    tokenName?: string;
    tokenSymbol?: string;
    amountSol: number;
    amountLamports: number;
    claimType: string;
    isCashback: boolean;
    programId: string;
    claimLabel: string;
}

interface RelayStatusMessage {
    type: 'status';
    connected: boolean;
    totalClaims: number;
    clients: number;
}

// ============================================================================
// Monitor
// ============================================================================

export class ClaimMonitor {
    private ws: WebSocket | null = null;
    private config: BotConfig;
    private onClaim: (event: FeeClaimEvent) => void;
    private reconnectDelay = 1000;
    private reconnectTimer?: ReturnType<typeof setTimeout>;
    private alive = false;
    private startedAt = 0;
    public claimsDetected = 0;
    private connected = false;

    constructor(config: BotConfig, onClaim: (event: FeeClaimEvent) => void) {
        this.config = config;
        this.onClaim = onClaim;
    }

    async start(): Promise<void> {
        if (this.alive) return;
        this.alive = true;
        this.startedAt = Date.now();

        log.info('Connecting to relay: %s', this.config.relayWsUrl);
        this.connect();
    }

    stop(): void {
        this.alive = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        log.info('Claim monitor stopped');
    }

    getMode(): string {
        return this.connected ? 'relay (connected)' : 'relay (disconnected)';
    }

    getUptimeMs(): number {
        return this.startedAt ? Date.now() - this.startedAt : 0;
    }

    // ── WebSocket connection ─────────────────────────────────────────

    private connect(): void {
        if (!this.alive) return;

        this.ws = new WebSocket(this.config.relayWsUrl);

        this.ws.on('open', () => {
            log.info('Connected to relay');
            this.connected = true;
            this.reconnectDelay = 1000;
        });

        this.ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString()) as { type: string };

                if (msg.type === 'fee-claim') {
                    const claim = msg as RelayFeeClaimMessage;
                    const event: FeeClaimEvent = {
                        txSignature: claim.txSignature,
                        slot: claim.slot,
                        timestamp: claim.timestamp,
                        claimerWallet: claim.claimerWallet,
                        tokenMint: claim.tokenMint,
                        tokenName: claim.tokenName,
                        tokenSymbol: claim.tokenSymbol,
                        amountSol: claim.amountSol,
                        amountLamports: claim.amountLamports,
                        claimType: claim.claimType as FeeClaimEvent['claimType'],
                        isCashback: claim.isCashback,
                        programId: claim.programId,
                        claimLabel: claim.claimLabel,
                    };

                    this.claimsDetected++;
                    log.info('Relay claim: %s %.4f SOL (%s)',
                        event.claimType, event.amountSol, event.tokenMint.slice(0, 8));
                    this.onClaim(event);
                }
                // Ignore heartbeat, status, token-launch — we only care about claims
            } catch {
                // Ignore malformed messages
            }
        });

        this.ws.on('error', (err) => {
            log.warn('Relay WS error: %s', err.message);
        });

        this.ws.on('close', (code) => {
            log.warn('Relay disconnected (code=%d)', code);
            this.connected = false;
            this.ws = null;

            if (this.alive) {
                log.info('Reconnecting in %dms...', this.reconnectDelay);
                this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
                this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
            }
        });
    }
}
