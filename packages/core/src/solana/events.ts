// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt, https://x.com/nichxbt | https://github.com/nirholas

/**
 * @pumpkit/core: Pump event decoders
 *
 * Dependency-free, length-tolerant decoders for the Pump, PumpSwap and
 * PumpFees events a bot needs after the October 2026 upgrade:
 *
 *   - TradeEvent (every bonding curve trade: legacy, v2, v3, multi-hop hops)
 *   - PostCompleteBuyEvent (pool part of a buy that emptied the curve)
 *   - CreateEvent, CompleteEvent, CompletePumpAmmMigrationEvent
 *   - SetCreatorEvent / AdminCtoEvent / MigrateBondingCurveCreatorEvent
 *   - CollectCreatorFeeEvent, CollectCoinCreatorFeeEvent, ClaimCashbackEvent,
 *     SocialFeePdaClaimed (fee claims)
 *   - DistributeCreatorFeesEvent (fee sharing payouts)
 *   - SweepBondingCurveFeeEvent / SweepPoolFeeEvent (fee sweeps)
 *
 * Every decoder reads a fixed prefix and treats later fields as optional, so
 * events emitted before a field existed decode with that field missing
 * instead of throwing, and events that grow new trailing fields keep decoding.
 * Input is the raw `Program data:` payload, discriminator included.
 */

import { PublicKey } from '@solana/web3.js';

import {
    ADMIN_CTO_EVENT_DISCRIMINATOR,
    CLAIM_CASHBACK_EVENT_DISCRIMINATOR,
    COLLECT_COIN_CREATOR_FEE_EVENT_DISCRIMINATOR,
    COLLECT_CREATOR_FEE_EVENT_DISCRIMINATOR,
    COMPLETE_AMM_MIGRATION_EVENT_DISCRIMINATOR,
    COMPLETE_EVENT_DISCRIMINATOR,
    CREATE_EVENT_DISCRIMINATOR,
    DISTRIBUTE_CREATOR_FEES_EVENT_DISCRIMINATOR,
    FEE_KEPT_ON_CURVE_RECIPIENT,
    MIGRATE_BONDING_CURVE_CREATOR_EVENT_DISCRIMINATOR,
    POST_COMPLETE_BUY_EVENT_DISCRIMINATOR,
    PUMP_AMM_POOL_ACCOUNT_DISCRIMINATOR,
    PUMP_AMM_PROGRAM_ID,
    PUMP_FEE_PROGRAM_ID,
    PUMP_PROGRAM_ID,
    SET_CREATOR_EVENT_DISCRIMINATOR,
    SOCIAL_FEE_PDA_CLAIMED_EVENT_DISCRIMINATOR,
    SWEEP_BONDING_CURVE_FEE_EVENT_DISCRIMINATOR,
    SWEEP_POOL_FEE_EVENT_DISCRIMINATOR,
    TRADE_EVENT_DISCRIMINATOR,
    WSOL_MINT,
} from './programs.js';

const DEFAULT_PUBKEY = '11111111111111111111111111111111';

// ── Byte reader ──────────────────────────────────────────────────────

class ByteReader {
    offset = 8;

    constructor(private readonly bytes: Buffer) {}

    remaining(): number {
        return this.bytes.length - this.offset;
    }

    has(size: number): boolean {
        return this.remaining() >= size;
    }

    pubkey(): string {
        const value = new PublicKey(this.take(32)).toBase58();
        return value;
    }

    u64(): bigint {
        const value = this.bytes.readBigUInt64LE(this.offset);
        this.offset += 8;
        return value;
    }

    i64(): bigint {
        const value = this.bytes.readBigInt64LE(this.offset);
        this.offset += 8;
        return value;
    }

    u32(): number {
        const value = this.bytes.readUInt32LE(this.offset);
        this.offset += 4;
        return value;
    }

    u16(): number {
        const value = this.bytes.readUInt16LE(this.offset);
        this.offset += 2;
        return value;
    }

    u8(): number {
        const value = this.bytes.readUInt8(this.offset);
        this.offset += 1;
        return value;
    }

    bool(): boolean {
        return this.u8() === 1;
    }

    string(): string {
        const len = this.u32();
        return this.take(len).toString('utf8');
    }

    skip(size: number): void {
        this.take(size);
    }

    private take(size: number): Buffer {
        if (this.remaining() < size) {
            throw new RangeError(`event truncated: need ${size} bytes at offset ${this.offset}, have ${this.remaining()}`);
        }
        const slice = this.bytes.subarray(this.offset, this.offset + size);
        this.offset += size;
        return slice;
    }
}

function hasDiscriminator(bytes: Buffer, discriminator: Buffer): boolean {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(discriminator);
}

/** `null` and the default key both mean "SOL" for a curve's quote mint. */
export function isSolQuoteMint(quoteMint: string | null | undefined): boolean {
    return !quoteMint || quoteMint === DEFAULT_PUBKEY || quoteMint === WSOL_MINT;
}

// ── TradeEvent ───────────────────────────────────────────────────────

export interface PumpTradeEvent {
    mint: string;
    /** Quote paid or received, in the quote mint's base units (lamports for SOL pairs). */
    solAmount: bigint;
    tokenAmount: bigint;
    isBuy: boolean;
    user: string;
    timestamp: bigint;
    virtualSolReserves: bigint;
    virtualTokenReserves: bigint;
    realSolReserves: bigint;
    realTokenReserves: bigint;
    /** Zero key on v3 trades and multi-hop curve hops: the protocol fee stayed on the curve. */
    feeRecipient: string;
    feeBasisPoints: bigint;
    fee: bigint;
    creator: string;
    creatorFeeBasisPoints: bigint;
    creatorFee: bigint;
    /**
     * Instruction that produced the trade, e.g. `buy`, `buy_v3`,
     * `buy_exact_quote_in_v3`, `sell_v3` or `multi_hop_swap`. `null` on
     * events that predate the field.
     */
    ixName: string | null;
    mayhemMode: boolean;
    buybackFee: bigint;
    /** Quote mint as stored on the curve. `null` when the event predates the field. */
    quoteMint: string | null;
    /** Creator fee waiting on the curve after this trade (v3 trades). `null` when absent. */
    creatorFeeUnclaimed: bigint | null;
    /** True when `feeRecipient` is the zero key, i.e. the fee waits for `sweep_protocol_fee`. */
    feeKeptOnCurve: boolean;
}

/** Bytes through `creator_fee`: the prefix every TradeEvent version carries. */
const TRADE_EVENT_PREFIX = 8 + 32 + 8 + 8 + 1 + 32 + 8 + 8 * 4 + 32 + 8 + 8 + 32 + 8 + 8;

export function decodeTradeEvent(bytes: Buffer): PumpTradeEvent | null {
    if (!hasDiscriminator(bytes, TRADE_EVENT_DISCRIMINATOR) || bytes.length < TRADE_EVENT_PREFIX) return null;
    const r = new ByteReader(bytes);
    const event: PumpTradeEvent = {
        mint: r.pubkey(),
        solAmount: r.u64(),
        tokenAmount: r.u64(),
        isBuy: r.bool(),
        user: r.pubkey(),
        timestamp: r.i64(),
        virtualSolReserves: r.u64(),
        virtualTokenReserves: r.u64(),
        realSolReserves: r.u64(),
        realTokenReserves: r.u64(),
        feeRecipient: r.pubkey(),
        feeBasisPoints: r.u64(),
        fee: r.u64(),
        creator: r.pubkey(),
        creatorFeeBasisPoints: r.u64(),
        creatorFee: r.u64(),
        ixName: null,
        mayhemMode: false,
        buybackFee: 0n,
        quoteMint: null,
        creatorFeeUnclaimed: null,
        feeKeptOnCurve: false,
    };
    event.feeKeptOnCurve = event.feeRecipient === FEE_KEPT_ON_CURVE_RECIPIENT;
    readTradeEventTail(r, event);
    return event;
}

/**
 * Optional trailing fields, appended by successive upgrades:
 * track_volume, volume accumulator stats, ix_name, mayhem_mode, cashback,
 * buyback fee, shareholders, quote_mint, quote_amount, quote reserves,
 * holder rewards, creator_fee_unclaimed.
 */
function readTradeEventTail(r: ByteReader, event: PumpTradeEvent): void {
    const VOLUME_FIELDS = 1 + 8 + 8 + 8 + 8;
    if (!r.has(VOLUME_FIELDS + 4)) return;
    r.skip(VOLUME_FIELDS);
    event.ixName = r.string();
    if (!r.has(1)) return;
    event.mayhemMode = r.bool();
    if (!r.has(8 * 4)) return;
    r.skip(8 * 2); // cashback_fee_basis_points, cashback
    r.skip(8); // buyback_fee_basis_points
    event.buybackFee = r.u64();
    if (!r.has(4)) return;
    const shareholders = r.u32();
    if (!r.has(shareholders * (32 + 2))) return;
    r.skip(shareholders * (32 + 2));
    if (!r.has(32)) return;
    event.quoteMint = r.pubkey();
    const QUOTE_AND_HOLDER_FIELDS = 8 * 5; // quote_amount, virtual/real quote reserves, holder_rewards_bps, holder_rewards
    if (!r.has(QUOTE_AND_HOLDER_FIELDS + 8)) return;
    r.skip(QUOTE_AND_HOLDER_FIELDS);
    event.creatorFeeUnclaimed = r.u64();
}

// ── PostCompleteBuyEvent ─────────────────────────────────────────────

export interface PostCompleteBuyEvent {
    user: string;
    mint: string;
    bondingCurve: string;
    quoteMint: string;
    timestamp: bigint;
    /** Extra tokens bought from the pool-to-be. */
    baseOut: bigint;
    /** Quote those tokens cost, fees included. */
    quoteIn: bigint;
    feeBasisPoints: bigint;
    fee: bigint;
    creatorFeeBasisPoints: bigint;
    creatorFee: bigint;
    buybackFee: bigint;
    poolBaseReservesBefore: bigint;
    poolQuoteReservesBefore: bigint;
    poolBaseReservesAfter: bigint;
    poolQuoteReservesAfter: bigint;
}

export function decodePostCompleteBuyEvent(bytes: Buffer): PostCompleteBuyEvent | null {
    if (!hasDiscriminator(bytes, POST_COMPLETE_BUY_EVENT_DISCRIMINATOR)) return null;
    const r = new ByteReader(bytes);
    try {
        return {
            user: r.pubkey(),
            mint: r.pubkey(),
            bondingCurve: r.pubkey(),
            quoteMint: r.pubkey(),
            timestamp: r.i64(),
            baseOut: r.u64(),
            quoteIn: r.u64(),
            feeBasisPoints: r.u64(),
            fee: r.u64(),
            creatorFeeBasisPoints: r.u64(),
            creatorFee: r.u64(),
            buybackFee: r.u64(),
            poolBaseReservesBefore: r.u64(),
            poolQuoteReservesBefore: r.u64(),
            poolBaseReservesAfter: r.u64(),
            poolQuoteReservesAfter: r.u64(),
        };
    } catch {
        return null;
    }
}

// ── CompleteEvent ────────────────────────────────────────────────────

export interface PumpCompleteEvent {
    user: string;
    mint: string;
    bondingCurve: string;
    timestamp: bigint;
    /** `null` when the event predates the field. */
    quoteMint: string | null;
}

export function decodeCompleteEvent(bytes: Buffer): PumpCompleteEvent | null {
    if (!hasDiscriminator(bytes, COMPLETE_EVENT_DISCRIMINATOR) || bytes.length < 8 + 32 * 3 + 8) return null;
    const r = new ByteReader(bytes);
    const event: PumpCompleteEvent = {
        user: r.pubkey(),
        mint: r.pubkey(),
        bondingCurve: r.pubkey(),
        timestamp: r.i64(),
        quoteMint: null,
    };
    if (r.has(32)) event.quoteMint = r.pubkey();
    return event;
}

// ── Fee sweep events ─────────────────────────────────────────────────

export type SweepBucket = 'protocol' | 'creator';

export interface SweepFeeEvent {
    program: 'pump' | 'pump-amm';
    timestamp: bigint;
    /** Coin mint. For a pool sweep this is the pool's base mint. */
    mint: string;
    /** Bonding curve for a Pump sweep, pool for a PumpSwap sweep. */
    account: string;
    quoteMint: string;
    recipient: string;
    /** Payer of a PumpSwap sweep (absent on Pump sweeps). */
    payer: string | null;
    amount: bigint;
    bucket: SweepBucket;
}

const bucketName = (bucket: number): SweepBucket => (bucket === 1 ? 'creator' : 'protocol');

export function decodeSweepBondingCurveFeeEvent(bytes: Buffer): SweepFeeEvent | null {
    if (!hasDiscriminator(bytes, SWEEP_BONDING_CURVE_FEE_EVENT_DISCRIMINATOR)) return null;
    const r = new ByteReader(bytes);
    try {
        const timestamp = r.i64();
        const mint = r.pubkey();
        const account = r.pubkey();
        const quoteMint = r.pubkey();
        const recipient = r.pubkey();
        const amount = r.u64();
        const bucket = bucketName(r.u8());
        return { program: 'pump', timestamp, mint, account, quoteMint, recipient, payer: null, amount, bucket };
    } catch {
        return null;
    }
}

export function decodeSweepPoolFeeEvent(bytes: Buffer): SweepFeeEvent | null {
    if (!hasDiscriminator(bytes, SWEEP_POOL_FEE_EVENT_DISCRIMINATOR)) return null;
    const r = new ByteReader(bytes);
    try {
        const timestamp = r.i64();
        const account = r.pubkey();
        const mint = r.pubkey();
        const quoteMint = r.pubkey();
        const recipient = r.pubkey();
        const payer = r.pubkey();
        const amount = r.u64();
        const bucket = bucketName(r.u8());
        return { program: 'pump-amm', timestamp, mint, account, quoteMint, recipient, payer, amount, bucket };
    } catch {
        return null;
    }
}

// ── CreateEvent ──────────────────────────────────────────────────────

export interface PumpCreateEvent {
    name: string;
    symbol: string;
    uri: string;
    mint: string;
    bondingCurve: string;
    /** Signer that paid for the create. */
    user: string;
    /** Creator that earns creator fees. */
    creator: string;
    timestamp: bigint;
    /** `null` when the event predates the field. */
    tokenProgram: string | null;
    isMayhemMode: boolean;
    isCashbackEnabled: boolean;
    /** `null` when the event predates the field. */
    quoteMint: string | null;
}

export function decodeCreateEvent(bytes: Buffer): PumpCreateEvent | null {
    if (!hasDiscriminator(bytes, CREATE_EVENT_DISCRIMINATOR)) return null;
    const r = new ByteReader(bytes);
    let event: PumpCreateEvent;
    try {
        event = {
            name: r.string(),
            symbol: r.string(),
            uri: r.string(),
            mint: r.pubkey(),
            bondingCurve: r.pubkey(),
            user: r.pubkey(),
            creator: r.pubkey(),
            timestamp: r.i64(),
            tokenProgram: null,
            isMayhemMode: false,
            isCashbackEnabled: false,
            quoteMint: null,
        };
    } catch {
        return null;
    }
    // virtual_token_reserves, virtual_sol_reserves, real_token_reserves, token_total_supply
    if (!r.has(8 * 4 + 32)) return event;
    r.skip(8 * 4);
    event.tokenProgram = r.pubkey();
    if (!r.has(2)) return event;
    event.isMayhemMode = r.bool();
    event.isCashbackEnabled = r.bool();
    if (r.has(32)) event.quoteMint = r.pubkey();
    return event;
}

// ── CompletePumpAmmMigrationEvent ────────────────────────────────────

export interface PumpAmmMigrationEvent {
    user: string;
    mint: string;
    mintAmount: bigint;
    solAmount: bigint;
    poolMigrationFee: bigint;
    bondingCurve: string;
    timestamp: bigint;
    pool: string;
    /** `null` when the event predates the field. */
    quoteMint: string | null;
}

export function decodeAmmMigrationEvent(bytes: Buffer): PumpAmmMigrationEvent | null {
    if (!hasDiscriminator(bytes, COMPLETE_AMM_MIGRATION_EVENT_DISCRIMINATOR)) return null;
    const r = new ByteReader(bytes);
    try {
        const event: PumpAmmMigrationEvent = {
            user: r.pubkey(),
            mint: r.pubkey(),
            mintAmount: r.u64(),
            solAmount: r.u64(),
            poolMigrationFee: r.u64(),
            bondingCurve: r.pubkey(),
            timestamp: r.i64(),
            pool: r.pubkey(),
            quoteMint: null,
        };
        if (r.has(32)) event.quoteMint = r.pubkey();
        return event;
    } catch {
        return null;
    }
}

// ── Creator changes ──────────────────────────────────────────────────

export type CreatorChangeKind = 'set_creator' | 'admin_cto' | 'migrate_to_sharing_config';

export interface CreatorChangeEvent {
    kind: CreatorChangeKind;
    timestamp: bigint;
    mint: string;
    bondingCurve: string;
    /** `null` for `set_creator`, whose event does not carry the previous creator. */
    oldCreator: string | null;
    newCreator: string;
}

export function decodeCreatorChangeEvent(bytes: Buffer): CreatorChangeEvent | null {
    if (bytes.length < 8) return null;
    const r = new ByteReader(bytes);
    try {
        if (hasDiscriminator(bytes, SET_CREATOR_EVENT_DISCRIMINATOR)) {
            const timestamp = r.i64();
            const mint = r.pubkey();
            const bondingCurve = r.pubkey();
            const newCreator = r.pubkey();
            return { kind: 'set_creator', timestamp, mint, bondingCurve, oldCreator: null, newCreator };
        }
        if (hasDiscriminator(bytes, ADMIN_CTO_EVENT_DISCRIMINATOR)) {
            const timestamp = r.i64();
            r.skip(32); // authority
            const mint = r.pubkey();
            const bondingCurve = r.pubkey();
            const oldCreator = r.pubkey();
            const newCreator = r.pubkey();
            return { kind: 'admin_cto', timestamp, mint, bondingCurve, oldCreator, newCreator };
        }
        if (hasDiscriminator(bytes, MIGRATE_BONDING_CURVE_CREATOR_EVENT_DISCRIMINATOR)) {
            const timestamp = r.i64();
            const mint = r.pubkey();
            const bondingCurve = r.pubkey();
            r.skip(32); // sharing_config
            const oldCreator = r.pubkey();
            const newCreator = r.pubkey();
            return { kind: 'migrate_to_sharing_config', timestamp, mint, bondingCurve, oldCreator, newCreator };
        }
    } catch {
        return null;
    }
    return null;
}

// ── Fee claims ───────────────────────────────────────────────────────

export type FeeClaimKind = 'creator_fee' | 'amm_creator_fee' | 'cashback' | 'social_fee';

export interface FeeClaimEvent {
    kind: FeeClaimKind;
    program: 'pump' | 'pump-amm' | 'pump-fees';
    /** Wallet that received the funds. */
    wallet: string;
    /** Amount claimed, in base units of `quoteMint` (lamports when it is SOL or unknown). */
    amount: bigint;
    /** `null` when the event does not say (cashback, PumpSwap creator fees, older events). */
    quoteMint: string | null;
    timestamp: bigint;
}

type ClaimProgram = FeeClaimEvent['program'];

export function decodeFeeClaimEvent(bytes: Buffer, program: ClaimProgram): FeeClaimEvent | null {
    if (bytes.length < 8) return null;
    const r = new ByteReader(bytes);
    try {
        if (program === 'pump' && hasDiscriminator(bytes, COLLECT_CREATOR_FEE_EVENT_DISCRIMINATOR)) {
            const timestamp = r.i64();
            const wallet = r.pubkey();
            const amount = r.u64();
            const quoteMint = r.has(32) ? r.pubkey() : null;
            return { kind: 'creator_fee', program, wallet, amount, quoteMint, timestamp };
        }
        if (program === 'pump-amm' && hasDiscriminator(bytes, COLLECT_COIN_CREATOR_FEE_EVENT_DISCRIMINATOR)) {
            const timestamp = r.i64();
            const wallet = r.pubkey();
            const amount = r.u64();
            return { kind: 'amm_creator_fee', program, wallet, amount, quoteMint: null, timestamp };
        }
        if (program !== 'pump-fees' && hasDiscriminator(bytes, CLAIM_CASHBACK_EVENT_DISCRIMINATOR)) {
            const wallet = r.pubkey();
            const amount = r.u64();
            const timestamp = r.i64();
            return { kind: 'cashback', program, wallet, amount, quoteMint: null, timestamp };
        }
        if (program === 'pump-fees' && hasDiscriminator(bytes, SOCIAL_FEE_PDA_CLAIMED_EVENT_DISCRIMINATOR)) {
            const timestamp = r.i64();
            r.string(); // user_id
            r.skip(1 + 32); // platform, social_fee_pda
            const wallet = r.pubkey(); // recipient
            r.skip(32); // social_claim_authority
            const amount = r.u64();
            // claimable_before, lifetime_claimed, recipient_balance_before, recipient_balance_after
            const quoteMint = r.has(8 * 4 + 32) ? (r.skip(8 * 4), r.pubkey()) : null;
            return { kind: 'social_fee', program, wallet, amount, quoteMint, timestamp };
        }
    } catch {
        return null;
    }
    return null;
}

// ── DistributeCreatorFeesEvent ───────────────────────────────────────

export interface CreatorFeeDistributionEvent {
    timestamp: bigint;
    mint: string;
    bondingCurve: string;
    sharingConfig: string;
    admin: string;
    shareholders: Array<{ address: string; shareBps: number }>;
    /** Total paid out, in base units of `quoteMint` (lamports when `null`). */
    distributed: bigint;
    /** `null` when the event predates the field. */
    quoteMint: string | null;
}

export function decodeCreatorFeeDistributionEvent(bytes: Buffer): CreatorFeeDistributionEvent | null {
    if (!hasDiscriminator(bytes, DISTRIBUTE_CREATOR_FEES_EVENT_DISCRIMINATOR)) return null;
    const r = new ByteReader(bytes);
    try {
        const timestamp = r.i64();
        const mint = r.pubkey();
        const bondingCurve = r.pubkey();
        const sharingConfig = r.pubkey();
        const admin = r.pubkey();
        const count = r.u32();
        if (!r.has(count * (32 + 2))) return null;
        const shareholders: CreatorFeeDistributionEvent['shareholders'] = [];
        for (let i = 0; i < count; i++) {
            shareholders.push({ address: r.pubkey(), shareBps: r.u16() });
        }
        const distributed = r.u64();
        const quoteMint = r.has(32) ? r.pubkey() : null;
        return { timestamp, mint, bondingCurve, sharingConfig, admin, shareholders, distributed, quoteMint };
    } catch {
        return null;
    }
}

// ── Log parsing ──────────────────────────────────────────────────────

export type PumpLogEvent =
    | { type: 'trade'; data: PumpTradeEvent }
    | { type: 'postCompleteBuy'; data: PostCompleteBuyEvent }
    | { type: 'complete'; data: PumpCompleteEvent }
    | { type: 'sweep'; data: SweepFeeEvent }
    | { type: 'create'; data: PumpCreateEvent }
    | { type: 'ammMigration'; data: PumpAmmMigrationEvent }
    | { type: 'creatorChange'; data: CreatorChangeEvent }
    | { type: 'feeClaim'; data: FeeClaimEvent }
    | { type: 'creatorFeeDistribution'; data: CreatorFeeDistributionEvent };

const PROGRAM_INVOKE = /^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) invoke \[\d+\]$/;
const PROGRAM_EXIT = /^Program [1-9A-HJ-NP-Za-km-z]{32,44} (success|failed)/;

/**
 * Decode the trade, completion and sweep events out of a transaction's log
 * lines, in emission order. The invoke stack is tracked so each
 * `Program data:` line is matched against the program that emitted it
 * (Pump and PumpSwap share the sweep instruction names).
 */
export function parsePumpLogEvents(logs: readonly string[]): PumpLogEvent[] {
    const events: PumpLogEvent[] = [];
    const stack: string[] = [];
    for (const line of logs) {
        const invoke = PROGRAM_INVOKE.exec(line);
        if (invoke) {
            stack.push(invoke[1]!);
            continue;
        }
        if (PROGRAM_EXIT.test(line)) {
            stack.pop();
            continue;
        }
        if (!line.startsWith('Program data: ')) continue;
        const bytes = Buffer.from(line.slice('Program data: '.length), 'base64');
        const event = decodeForProgram(bytes, stack[stack.length - 1]);
        if (event) events.push(event);
    }
    return events;
}

function decodeForProgram(bytes: Buffer, programId: string | undefined): PumpLogEvent | null {
    if (bytes.length < 8) return null;
    if (programId === PUMP_AMM_PROGRAM_ID) {
        const sweep = decodeSweepPoolFeeEvent(bytes);
        if (sweep) return { type: 'sweep', data: sweep };
        const claim = decodeFeeClaimEvent(bytes, 'pump-amm');
        return claim ? { type: 'feeClaim', data: claim } : null;
    }
    if (programId === PUMP_FEE_PROGRAM_ID) {
        const claim = decodeFeeClaimEvent(bytes, 'pump-fees');
        return claim ? { type: 'feeClaim', data: claim } : null;
    }
    if (programId !== undefined && programId !== PUMP_PROGRAM_ID) return null;
    const trade = decodeTradeEvent(bytes);
    if (trade) return { type: 'trade', data: trade };
    const post = decodePostCompleteBuyEvent(bytes);
    if (post) return { type: 'postCompleteBuy', data: post };
    const complete = decodeCompleteEvent(bytes);
    if (complete) return { type: 'complete', data: complete };
    const sweep = decodeSweepBondingCurveFeeEvent(bytes);
    if (sweep) return { type: 'sweep', data: sweep };
    const create = decodeCreateEvent(bytes);
    if (create) return { type: 'create', data: create };
    const migration = decodeAmmMigrationEvent(bytes);
    if (migration) return { type: 'ammMigration', data: migration };
    const creatorChange = decodeCreatorChangeEvent(bytes);
    if (creatorChange) return { type: 'creatorChange', data: creatorChange };
    const claim = decodeFeeClaimEvent(bytes, 'pump');
    if (claim) return { type: 'feeClaim', data: claim };
    const distribution = decodeCreatorFeeDistributionEvent(bytes);
    return distribution ? { type: 'creatorFeeDistribution', data: distribution } : null;
}

// ── Trade aggregation ────────────────────────────────────────────────

export interface AggregatedTrade extends PumpTradeEvent {
    /** True when a PostCompleteBuyEvent for the same buy was folded in. */
    syntheticMigration: boolean;
    /** Pool part of a synthetic-migration buy, when there was one. */
    postComplete: PostCompleteBuyEvent | null;
}

/**
 * Fold each PostCompleteBuyEvent into the TradeEvent it continues, so a buy
 * that emptied the curve reports the buyer's full amounts and fees.
 * Per the protocol docs, the buyer's total is the TradeEvent amounts plus the
 * PostCompleteBuyEvent amounts; the pool part's `quote_in` includes its fees.
 */
export function aggregateTrades(events: readonly PumpLogEvent[]): AggregatedTrade[] {
    const trades: AggregatedTrade[] = [];
    for (const event of events) {
        if (event.type === 'trade') {
            trades.push({ ...event.data, syntheticMigration: false, postComplete: null });
            continue;
        }
        if (event.type !== 'postCompleteBuy') continue;
        const post = event.data;
        const target = findOpenBuy(trades, post);
        if (!target) continue;
        target.syntheticMigration = true;
        target.postComplete = post;
        target.solAmount += post.quoteIn;
        target.tokenAmount += post.baseOut;
        target.fee += post.fee;
        target.creatorFee += post.creatorFee;
        target.buybackFee += post.buybackFee;
    }
    return trades;
}

function findOpenBuy(trades: AggregatedTrade[], post: PostCompleteBuyEvent): AggregatedTrade | undefined {
    for (let i = trades.length - 1; i >= 0; i--) {
        const trade = trades[i]!;
        if (trade.isBuy && !trade.syntheticMigration && trade.mint === post.mint && trade.user === post.user) {
            return trade;
        }
    }
    return undefined;
}

// ── PumpSwap reserves ────────────────────────────────────────────────

/**
 * Quote reserves a PumpSwap pool prices against:
 * `pool_quote_token_account.amount + Pool.virtual_quote_reserves`.
 *
 * `virtual_quote_reserves` is a signed i128 (boost minus the protocol and
 * creator fees kept in the pool) and is negative whenever kept fees exceed
 * the boost. Pass `null` / `undefined` for pools written before the field
 * existed; that reads as 0. The program guarantees the sum is never negative.
 */
export function effectivePoolQuoteReserves(
    poolQuoteTokenAmount: bigint,
    virtualQuoteReserves: bigint | null | undefined,
): bigint {
    const effective = poolQuoteTokenAmount + (virtualQuoteReserves ?? 0n);
    if (effective < 0n) {
        throw new RangeError(
            `effective quote reserves are negative (${poolQuoteTokenAmount} + ${virtualQuoteReserves}); the pool data is stale or mismatched`,
        );
    }
    return effective;
}

// ── PumpSwap Pool account ────────────────────────────────────────────

/**
 * The PumpSwap `Pool` fields a fee claimer or a pricer needs. Pools written
 * before a field was appended are shorter; a missing trailing field reads as
 * its zero value, as the protocol docs prescribe.
 */
export interface PumpPoolState {
    creator: string;
    baseMint: string;
    quoteMint: string;
    poolBaseTokenAccount: string;
    poolQuoteTokenAccount: string;
    /** `Pool.coin_creator`: the key the PumpSwap creator fee sweep and collect pay. */
    coinCreator: string;
    isMayhemMode: boolean;
    isCashbackCoin: boolean;
    /** Signed i128. Negative while kept fees exceed the pool's boost. */
    virtualQuoteReserves: bigint;
    /** Protocol fee kept in the pool by v2 trades, waiting for `sweep_protocol_fee`. */
    protocolFees: bigint;
    /** Creator fee kept in the pool by v2 trades, waiting for `sweep_creator_fee`. */
    creatorFees: bigint;
}

/** Bytes through `lp_supply`: every Pool layout carries them. */
const POOL_PREFIX = 211;
const POOL_COIN_CREATOR = 211;
const POOL_MAYHEM = 243;
const POOL_CASHBACK = 244;
const POOL_VIRTUAL_QUOTE_RESERVES = 245;
const POOL_PROTOCOL_FEES = 271;
const POOL_CREATOR_FEES = 279;

function readI128LE(bytes: Buffer, offset: number): bigint {
    const low = bytes.readBigUInt64LE(offset);
    const high = bytes.readBigInt64LE(offset + 8);
    return (high << 64n) + low;
}

function optionalPubkey(bytes: Buffer, offset: number): string {
    return bytes.length >= offset + 32 ? new PublicKey(bytes.subarray(offset, offset + 32)).toBase58() : DEFAULT_PUBKEY;
}

function optionalU64(bytes: Buffer, offset: number): bigint {
    return bytes.length >= offset + 8 ? bytes.readBigUInt64LE(offset) : 0n;
}

export function decodePumpPool(data: Buffer): PumpPoolState | null {
    if (!hasDiscriminator(data, PUMP_AMM_POOL_ACCOUNT_DISCRIMINATOR) || data.length < POOL_PREFIX) return null;
    const r = new ByteReader(data);
    r.skip(1 + 2);
    const creator = r.pubkey();
    const baseMint = r.pubkey();
    const quoteMint = r.pubkey();
    r.skip(32);
    const poolBaseTokenAccount = r.pubkey();
    const poolQuoteTokenAccount = r.pubkey();
    return {
        creator,
        baseMint,
        quoteMint,
        poolBaseTokenAccount,
        poolQuoteTokenAccount,
        coinCreator: optionalPubkey(data, POOL_COIN_CREATOR),
        isMayhemMode: data.length > POOL_MAYHEM && data[POOL_MAYHEM] === 1,
        isCashbackCoin: data.length > POOL_CASHBACK && data[POOL_CASHBACK] === 1,
        virtualQuoteReserves:
            data.length >= POOL_VIRTUAL_QUOTE_RESERVES + 16 ? readI128LE(data, POOL_VIRTUAL_QUOTE_RESERVES) : 0n,
        protocolFees: optionalU64(data, POOL_PROTOCOL_FEES),
        creatorFees: optionalU64(data, POOL_CREATOR_FEES),
    };
}
