/**
 * PumpFun Claim Bot — Direct Solana RPC Monitor
 *
 * Monitors Pump/PumpSwap/PumpFees programs directly via Solana RPC.
 * Uses WebSocket log subscriptions when available, falls back to HTTP polling.
 * No relay server needed — runs standalone on Railway.
 */

import {
    Connection,
    LAMPORTS_PER_SOL,
    PublicKey,
    type Logs,
    type SignaturesForAddressOptions,
} from '@solana/web3.js';

import type { BotConfig, ClaimType, FeeClaimEvent, InstructionDef } from './types.js';
import {
    CLAIM_EVENT_DISCRIMINATORS,
    CLAIM_INSTRUCTIONS,
    MONITORED_PROGRAM_IDS,
    PUMPFUN_FEE_ACCOUNT,
    PUMP_FEE_RECIPIENT_SET,
    QUOTE_MINT_INFO,
    WSOL_MINT,
} from './types.js';
import { log } from './logger.js';

// Known system accounts to skip when looking for token mint
const SYSTEM_ACCOUNTS = new Set([
    '11111111111111111111111111111111',
    'SysvarRent111111111111111111111111111111111',
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
    'So11111111111111111111111111111111111111112',
    ...PUMP_FEE_RECIPIENT_SET,
    ...MONITORED_PROGRAM_IDS,
]);

// ── Rate-limited Queue ──────────────────────────────────────────────

const MAX_QUEUE = 50;
const MIN_INTERVAL_MS = 1_000;

class TxQueue {
    private queue: string[] = [];
    private processing = false;
    private lastTime = 0;
    constructor(private processFn: (sig: string) => Promise<void>) {}

    enqueue(sig: string): void {
        if (this.queue.length >= MAX_QUEUE) return;
        this.queue.push(sig);
        void this.drain();
    }

    private async drain(): Promise<void> {
        if (this.processing) return;
        this.processing = true;
        while (this.queue.length > 0) {
            const elapsed = Date.now() - this.lastTime;
            if (elapsed < MIN_INTERVAL_MS) {
                await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
            }
            const sig = this.queue.shift();
            if (!sig) break;
            this.lastTime = Date.now();
            try {
                await this.processFn(sig);
            } catch (e) {
                log.error('Queue error: %s', e instanceof Error ? e.message : e);
            }
        }
        this.processing = false;
    }
}

// ============================================================================
// RpcClaimMonitor
// ============================================================================

export class RpcClaimMonitor {
    private connection: Connection;
    private wsSubscriptionIds: number[] = [];
    private pollTimer?: ReturnType<typeof setInterval>;
    private lastSignatures = new Map<string, string | undefined>();
    private processedSigs = new Set<string>();
    private txQueue: TxQueue;
    private alive = false;
    private startedAt = 0;
    private connected = false;
    private pollIntervalMs: number;

    public claimsDetected = 0;

    constructor(
        private config: BotConfig,
        private onClaim: (event: FeeClaimEvent) => void,
    ) {
        this.connection = new Connection(config.solanaRpcUrl!, {
            commitment: 'confirmed',
            disableRetryOnRateLimit: true,
        });
        this.pollIntervalMs = (config.pollIntervalSeconds ?? 15) * 1000;
        this.txQueue = new TxQueue((sig) => this.processTransaction(sig));
    }

    async start(): Promise<void> {
        if (this.alive) return;
        this.alive = true;
        this.startedAt = Date.now();

        log.info('Starting RPC claim monitor (%d programs)', MONITORED_PROGRAM_IDS.length);
        log.info('  RPC: %s', this.config.solanaRpcUrl!.replace(/api-key=[\w-]+/, 'api-key=***'));

        if (this.config.solanaWsUrl) {
            try {
                this.startWebSocket();
                log.info('RPC monitor: WebSocket mode');
                return;
            } catch (err) {
                log.warn('WS failed, falling back to polling: %s', err);
            }
        }

        this.startPolling();
        log.info('RPC monitor: Polling mode (every %ds)', this.pollIntervalMs / 1000);
    }

    stop(): void {
        this.alive = false;
        for (const id of this.wsSubscriptionIds) {
            this.connection.removeOnLogsListener(id).catch(() => {});
        }
        this.wsSubscriptionIds = [];
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = undefined;
        }
        log.info('RPC claim monitor stopped');
    }

    getMode(): string {
        if (!this.connected) return 'rpc (disconnected)';
        return this.config.solanaWsUrl ? 'rpc-ws (connected)' : 'rpc-poll (connected)';
    }

    getUptimeMs(): number {
        return this.startedAt ? Date.now() - this.startedAt : 0;
    }

    // ── WebSocket subscription ──────────────────────────────────────

    private startWebSocket(): void {
        const wsConn = new Connection(this.config.solanaRpcUrl!, {
            commitment: 'confirmed',
            wsEndpoint: this.config.solanaWsUrl,
        });

        const programPubkeys = MONITORED_PROGRAM_IDS.map((id) => new PublicKey(id));

        for (const programId of programPubkeys) {
            const subId = wsConn.onLogs(
                programId,
                (logInfo: Logs) => {
                    if (logInfo.err) return;
                    const sig = logInfo.signature;
                    if (this.processedSigs.has(sig)) return;

                    const logsStr = logInfo.logs.join(' ');
                    const hasClaimIx = CLAIM_INSTRUCTIONS.some((def) =>
                        logsStr.includes(def.discriminator),
                    );
                    const hasClaimEvent = Object.keys(CLAIM_EVENT_DISCRIMINATORS).some((disc) =>
                        logsStr.includes(disc),
                    );

                    if (hasClaimIx || hasClaimEvent) {
                        this.txQueue.enqueue(sig);
                    }
                },
                'confirmed',
            );
            this.wsSubscriptionIds.push(subId);
        }

        this.connected = true;
        log.info('Connected to Solana WebSocket');
    }

    // ── HTTP Polling ────────────────────────────────────────────────

    private startPolling(): void {
        setTimeout(() => void this.pollAll(), 2000);
        this.pollTimer = setInterval(() => void this.pollAll(), this.pollIntervalMs);
        this.connected = true;
    }

    private async pollAll(): Promise<void> {
        const programPubkeys = MONITORED_PROGRAM_IDS.map((id) => new PublicKey(id));
        for (const programId of programPubkeys) {
            try {
                await this.pollProgram(programId);
            } catch {
                // silent
            }
            await new Promise((r) => setTimeout(r, 500));
        }
    }

    private async pollProgram(programId: PublicKey): Promise<void> {
        const key = programId.toBase58();
        const opts: SignaturesForAddressOptions = { limit: 20 };
        const lastSig = this.lastSignatures.get(key);
        if (lastSig) opts.until = lastSig;

        const sigs = await this.connection.getSignaturesForAddress(programId, opts);
        if (sigs.length === 0) return;

        const newest = sigs[0];
        if (newest) this.lastSignatures.set(key, newest.signature);

        for (const info of sigs) {
            if (info.err) continue;
            if (this.processedSigs.has(info.signature)) continue;
            this.txQueue.enqueue(info.signature);
        }
    }

    // ── Transaction processing ──────────────────────────────────────

    private async processTransaction(signature: string): Promise<void> {
        if (this.processedSigs.has(signature)) return;
        this.processedSigs.add(signature);

        // Evict old entries
        if (this.processedSigs.size > 10_000) {
            const arr = [...this.processedSigs];
            this.processedSigs = new Set(arr.slice(-5000));
        }

        const tx = await this.connection.getTransaction(signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
        });
        if (!tx?.meta || tx.meta.err) return;

        const message = tx.transaction.message;
        const accountKeys = message.getAccountKeys({
            accountKeysFromLookups: tx.meta.loadedAddresses,
        });

        for (const ix of message.compiledInstructions) {
            const programKey = accountKeys.get(ix.programIdIndex);
            if (!programKey) continue;
            const pid = programKey.toBase58();

            if (!MONITORED_PROGRAM_IDS.includes(pid as (typeof MONITORED_PROGRAM_IDS)[number]))
                continue;

            const dataHex = Buffer.from(ix.data).toString('hex');
            const disc8 = dataHex.slice(0, 16);

            const matched = CLAIM_INSTRUCTIONS.find(
                (def) => def.discriminator === disc8 && def.programId === pid,
            );
            if (!matched) continue;

            const event = this.extractClaim(signature, tx, matched, accountKeys);
            if (event) {
                this.claimsDetected++;
                const ticker = event.quoteTicker ?? 'SOL';
                const amount = event.amountQuote ?? event.amountSol;
                log.info(
                    'Claim: %s %.4f %s (%s)',
                    event.claimType,
                    amount,
                    ticker,
                    event.tokenMint.slice(0, 8),
                );
                this.onClaim(event);
            }
        }
    }

    private extractClaim(
        signature: string,
        tx: Exclude<Awaited<ReturnType<Connection['getTransaction']>>, null>,
        def: InstructionDef,
        accountKeys: { get(i: number): PublicKey | undefined; length: number },
    ): FeeClaimEvent | null {
        const meta = tx.meta!;
        const blockTime = tx.blockTime ?? Math.floor(Date.now() / 1000);
        const { preBalances, postBalances } = meta;

        const signerKey = accountKeys.get(0);
        if (!signerKey) return null;
        const claimerWallet = signerKey.toBase58();

        // V2 quote-mint awareness. `amount_claimed` in the events is in base units
        // of the quote mint (lamports for SOL, micro-USDC for USDC, etc.). When
        // we can parse the event amount from the log we trust it; otherwise we
        // fall back to lamport balance-delta below (SOL-only, V1 behavior).
        let amountBaseUnits = 0;
        let quoteMint: string | undefined;
        const parsed = parseClaimEventFromLogs(meta.logMessages ?? [], def.claimType);
        if (parsed) {
            amountBaseUnits = parsed.amount;
            quoteMint = parsed.quoteMint;
        }

        // Fallback for SOL-paired V1 events without parseable log data:
        // determine lamports from fee-recipient balance decrease.
        if (amountBaseUnits === 0) {
            for (let i = 0; i < accountKeys.length; i++) {
                const key = accountKeys.get(i);
                if (!key) continue;
                if (!PUMP_FEE_RECIPIENT_SET.has(key.toBase58())) continue;
                const delta = (preBalances[i] ?? 0) - (postBalances[i] ?? 0);
                if (delta > amountBaseUnits) amountBaseUnits = delta;
            }
            if (
                amountBaseUnits <= 0 &&
                preBalances[0] !== undefined &&
                postBalances[0] !== undefined
            ) {
                amountBaseUnits = postBalances[0]! - preBalances[0]! + meta.fee;
            }
            if (amountBaseUnits < 0) amountBaseUnits = 0;
        }

        // Find token mint (first non-system account)
        let tokenMint = '';
        for (let i = 0; i < accountKeys.length; i++) {
            const key = accountKeys.get(i);
            if (!key) continue;
            const addr = key.toBase58();
            if (addr === claimerWallet || SYSTEM_ACCOUNTS.has(addr)) continue;
            tokenMint = addr;
            break;
        }

        // Resolve quote-currency metadata. Defaults to SOL when the event predates V2
        // or the quote_mint field couldn't be read — preserves V1 behavior.
        const resolvedQuoteMint = quoteMint ?? WSOL_MINT;
        const quoteInfo = QUOTE_MINT_INFO[resolvedQuoteMint] ?? QUOTE_MINT_INFO[WSOL_MINT]!;
        const quoteDivisor = Math.pow(10, quoteInfo.decimals);
        const amountQuote = amountBaseUnits / quoteDivisor;
        // amountSol is meaningful only when the quote is actually SOL. For USDC claims
        // we leave it 0 and downstream code branches on isStableQuote / quoteTicker.
        const amountSol = quoteInfo.isStable ? 0 : amountBaseUnits / LAMPORTS_PER_SOL;

        return {
            txSignature: signature,
            slot: tx.slot,
            timestamp: blockTime,
            claimerWallet,
            tokenMint,
            amountSol,
            amountLamports: amountBaseUnits,
            claimType: def.claimType,
            isCashback: def.claimType === 'claim_cashback',
            programId: def.programId,
            claimLabel: def.label,
            quoteMint: resolvedQuoteMint,
            quoteTicker: quoteInfo.ticker,
            isStableQuote: quoteInfo.isStable,
            amountQuote,
        };
    }

}

// ============================================================================
// Event-data parsing (Anchor `Program data:` log lines)
// ============================================================================

/**
 * Parses Anchor-emitted event records from `meta.logMessages` to extract the
 * fee amount and (for V2 events only) the trailing `quote_mint` pubkey.
 *
 * Returns `null` when no matching event is found — caller falls back to
 * lamport balance deltas (V1, SOL-only behavior).
 */
function parseClaimEventFromLogs(
    logMessages: string[],
    claimType: ClaimType,
): { amount: number; quoteMint?: string } | null {
    for (const line of logMessages) {
        if (!line.includes('Program data:')) continue;
        const b64 = line.split('Program data: ')[1]?.trim();
        if (!b64) continue;

        try {
            const bytes = Buffer.from(b64, 'base64');
            if (bytes.length < 8) continue;
            const disc = Buffer.from(bytes.subarray(0, 8)).toString('hex');
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

            // DistributeCreatorFeesEvent: a537817004b3ca28
            // V1 layout: disc(8) + ts(8) + mint(32) + bc(32) + cfg(32) + admin(32) + shareholders(vec) + distributed(u64)
            // V2 layout: ... + distributed(u64) + quote_mint(32)
            if (disc === 'a537817004b3ca28' && claimType === 'distribute_creator_fees') {
                const SHARE_VEC_OFFSET = 8 + 8 + 32 + 32 + 32 + 32; // 144
                if (bytes.length < SHARE_VEC_OFFSET + 4) continue;
                const shareCount = bytes.readUInt32LE(SHARE_VEC_OFFSET);
                const distributedOffset = SHARE_VEC_OFFSET + 4 + shareCount * 34;
                if (bytes.length < distributedOffset + 8) continue;
                const amount = Number(view.getBigUint64(distributedOffset, true));
                const qmOffset = distributedOffset + 8;
                const quoteMint = bytes.length >= qmOffset + 32
                    ? new PublicKey(bytes.subarray(qmOffset, qmOffset + 32)).toBase58()
                    : undefined;
                return { amount, quoteMint };
            }

            // CollectCreatorFeeEvent: 7a027f010ebf0caf
            // V1 layout: disc(8) + ts(8) + creator(32) + creatorFee(u64)
            // V2 layout: ... + quote_mint(32)
            if (disc === '7a027f010ebf0caf' && claimType === 'collect_creator_fee') {
                if (bytes.length < 56) continue;
                const amount = Number(view.getBigUint64(48, true));
                const quoteMint = bytes.length >= 88
                    ? new PublicKey(bytes.subarray(56, 88)).toBase58()
                    : undefined;
                return { amount, quoteMint };
            }

            // ClaimCashbackEvent: e2d6f62107f293e5
            // V1 layout: disc(8) + user(32) + amount(8) + ...
            if (disc === 'e2d6f62107f293e5' && claimType === 'claim_cashback') {
                if (bytes.length < 48) continue;
                const amount = Number(view.getBigUint64(40, true));
                return { amount };
            }

            // CollectCoinCreatorFeeEvent: e8f5c2eeeada3a59
            // Layout: disc(8) + ts(8) + coinCreator(32) + coinCreatorFee(u64) + ...
            if (disc === 'e8f5c2eeeada3a59' && claimType === 'collect_coin_creator_fee') {
                if (bytes.length < 56) continue;
                const amount = Number(view.getBigUint64(48, true));
                return { amount };
            }

            // SocialFeePdaClaimed: 3212c141edd2eaec
            // V1 layout: disc(8) + ts(8) + user_id(string) + platform(u8) + social_fee_pda(32)
            //          + recipient(32) + social_claim_authority(32) + amount_claimed(u64)
            //          + claimable_before(u64) + lifetime_claimed(u64)
            //          + recipient_balance_before(u64) + recipient_balance_after(u64)
            // V2 trailing: quote_mint(32) + lifetime_stable_claimed(u64)
            if (disc === '3212c141edd2eaec' && claimType === 'claim_social_fee_pda') {
                let offset = 16; // skip disc(8) + ts(8)
                if (bytes.length < offset + 4) continue;
                const uidLen = bytes.readUInt32LE(offset);
                offset += 4 + uidLen + 1; // string + platform(u8)
                offset += 32 + 32 + 32; // social_fee_pda + recipient + social_claim_authority
                if (bytes.length < offset + 8) continue;
                const amount = Number(view.getBigUint64(offset, true));
                offset += 8 + 8 + 8; // amount_claimed + claimable_before + lifetime_claimed
                // V2 only: skip recipient_balance_before(8) + recipient_balance_after(8), then read quote_mint
                const quoteMint = bytes.length >= offset + 16 + 32
                    ? new PublicKey(bytes.subarray(offset + 16, offset + 16 + 32)).toBase58()
                    : undefined;
                return { amount, quoteMint };
            }
        } catch {
            // skip unparseable log lines
        }
    }
    return null;
}
