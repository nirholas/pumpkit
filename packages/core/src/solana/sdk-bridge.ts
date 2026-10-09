// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

/**
 * @pumpkit/core — SDK Bridge
 *
 * Convenience wrappers around @nirholas/pump-sdk for PumpKit bots.
 * Fetches on-chain state and returns easy-to-consume results.
 *
 * Requires @nirholas/pump-sdk as a peer dependency. The v3 buy quotes
 * (`getBuyV3Quote`, `getBuyV3Cost`) and `getCreatorFeeSweepInstructions`
 * load the official @pump-fun/pump-sdk 4 on first use, so install it too
 * when you call them.
 */

import type { Connection, TransactionInstruction } from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import {
    OnlinePumpSdk,
    normalizeQuoteMint,
    getTokenPrice as sdkGetTokenPrice,
    getGraduationProgress as sdkGetGraduationProgress,
    getBuyTokenAmountFromSolAmount,
    getSellSolAmountFromTokenAmount,
    calculateBuyPriceImpact,
    calculateSellPriceImpact,
    bondingCurvePda,
} from '@nirholas/pump-sdk';
import type {
    BondingCurve,
    Global,
    FeeConfig,
    TokenPriceInfo,
    GraduationProgress,
} from '@nirholas/pump-sdk';

import { decodePumpPool } from './events.js';
import { WSOL_MINT } from './programs.js';

export interface BondingCurveInfo {
    virtualTokenReserves: string;
    /**
     * Virtual reserves of the curve's quote token, in the quote mint's base
     * units (lamports for a SOL-paired coin, micro-USDC for a USDC pair).
     */
    virtualQuoteReserves: string;
    realTokenReserves: string;
    /** Real reserves of the curve's quote token. See {@link BondingCurveInfo.virtualQuoteReserves}. */
    realQuoteReserves: string;
    /**
     * @deprecated Same value as `virtualQuoteReserves`. pump-sdk 2 renamed the
     * field because a curve can be quoted in USDC, not only SOL.
     */
    virtualSolReserves: string;
    /** @deprecated Same value as `realQuoteReserves`. */
    realSolReserves: string;
    tokenTotalSupply: string;
    complete: boolean;
    creator: string;
    isMayhemMode: boolean;
    /** Quote mint (wrapped SOL for legacy SOL-paired curves). */
    quoteMint: string;
    /** Legacy cashback coin. New cashback launches are rejected on-chain since pump-sdk 2. */
    isCashbackCoin: boolean;
    /** Creator fees are distributed to holders through the holder-rewards PDA. */
    isHolderReward: boolean;
    /** Per-coin creator fee in basis points. */
    creatorFeeBps: number;
}

// Internal helper to fetch all state needed for price calculations
async function fetchState(connection: Connection, mint: PublicKey) {
    const sdk = new OnlinePumpSdk(connection);
    const [global, feeConfig, bondingCurve] = await Promise.all([
        sdk.fetchGlobal(),
        sdk.fetchFeeConfig(),
        sdk.fetchBondingCurve(mint),
    ]);
    const mintSupply = await fetchMintSupply(connection, mint, bondingCurve);
    return { global, feeConfig, bondingCurve, mintSupply };
}

/**
 * The supply the fee tiers are computed from. The program prices every
 * non-mayhem curve at a fixed one-billion supply, so only a mayhem curve
 * needs the live SPL mint supply.
 */
async function fetchMintSupply(
    connection: Connection,
    mint: PublicKey,
    bondingCurve: { isMayhemMode: boolean; tokenTotalSupply: BN },
): Promise<BN> {
    if (!bondingCurve.isMayhemMode) return bondingCurve.tokenTotalSupply;
    const account = await connection.getAccountInfo(mint);
    if (!account || account.data.length < MINT_SUPPLY_OFFSET + 8) {
        throw new Error(`mint account ${mint.toBase58()} not found`);
    }
    return new BN(account.data.readBigUInt64LE(MINT_SUPPLY_OFFSET).toString());
}

/** `supply` sits after the 36-byte mint authority option in SPL Token and Token-2022 mints. */
const MINT_SUPPLY_OFFSET = 36;

/**
 * Get the current token price and market cap for a bonding curve token.
 * Returns null if the bonding curve account doesn't exist.
 */
export async function getTokenPrice(
    connection: Connection,
    mint: PublicKey,
): Promise<TokenPriceInfo | null> {
    try {
        const { global, feeConfig, bondingCurve, mintSupply } = await fetchState(connection, mint);
        return sdkGetTokenPrice({ global, feeConfig, mintSupply, bondingCurve });
    } catch {
        return null;
    }
}

/**
 * Get graduation progress for a bonding curve token.
 * Returns null if the bonding curve account doesn't exist.
 */
export async function getGraduationProgress(
    connection: Connection,
    mint: PublicKey,
): Promise<GraduationProgress | null> {
    try {
        const sdk = new OnlinePumpSdk(connection);
        const [global, bondingCurve] = await Promise.all([
            sdk.fetchGlobal(),
            sdk.fetchBondingCurve(mint),
        ]);
        return sdkGetGraduationProgress(global, bondingCurve);
    } catch {
        return null;
    }
}

/**
 * Get a buy quote: how many tokens for a given SOL amount.
 */
export async function getBuyQuote(
    connection: Connection,
    mint: PublicKey,
    solAmount: BN,
): Promise<{ tokens: BN; priceImpact: number } | null> {
    try {
        const { global, feeConfig, bondingCurve, mintSupply } = await fetchState(connection, mint);
        const tokens = getBuyTokenAmountFromSolAmount({
            global,
            feeConfig,
            mintSupply,
            bondingCurve,
            amount: solAmount,
        });
        const impact = calculateBuyPriceImpact({
            global,
            feeConfig,
            mintSupply,
            bondingCurve,
            solAmount,
        });
        return { tokens, priceImpact: impact.impactBps / 100 };
    } catch {
        return null;
    }
}

/**
 * Get a sell quote: how much SOL for a given token amount.
 */
export async function getSellQuote(
    connection: Connection,
    mint: PublicKey,
    tokenAmount: BN,
): Promise<{ sol: BN; priceImpact: number } | null> {
    try {
        const { global, feeConfig, bondingCurve, mintSupply } = await fetchState(connection, mint);
        const sol = getSellSolAmountFromTokenAmount({
            global,
            feeConfig,
            mintSupply,
            bondingCurve,
            amount: tokenAmount,
        });
        const impact = calculateSellPriceImpact({
            global,
            feeConfig,
            mintSupply,
            bondingCurve,
            tokenAmount,
        });
        return { sol, priceImpact: impact.impactBps / 100 };
    } catch {
        return null;
    }
}

/**
 * Fetch the raw bonding curve state for a token.
 * Returns null if the account doesn't exist.
 */
export async function getBondingCurveState(
    connection: Connection,
    mint: PublicKey,
): Promise<BondingCurveInfo | null> {
    try {
        const sdk = new OnlinePumpSdk(connection);
        const bc = await sdk.fetchBondingCurve(mint);
        const virtualQuoteReserves = bc.virtualQuoteReserves.toString();
        const realQuoteReserves = bc.realQuoteReserves.toString();
        return {
            virtualTokenReserves: bc.virtualTokenReserves.toString(),
            virtualQuoteReserves,
            realTokenReserves: bc.realTokenReserves.toString(),
            realQuoteReserves,
            virtualSolReserves: virtualQuoteReserves,
            realSolReserves: realQuoteReserves,
            tokenTotalSupply: bc.tokenTotalSupply.toString(),
            complete: bc.complete,
            creator: bc.creator.toBase58(),
            isMayhemMode: bc.isMayhemMode,
            quoteMint: normalizeQuoteMint(bc.quoteMint).toBase58(),
            isCashbackCoin: bc.isCashbackCoin,
            isHolderReward: bc.isHolderReward,
            creatorFeeBps: bc.creatorFeeBps.toNumber(),
        };
    } catch {
        return null;
    }
}

// ── v3 buy quotes (official @pump-fun/pump-sdk 4) ────────────────────

export interface BuyV3Quote {
    /** Tokens bought, or for `getBuyV3Cost` the tokens requested. */
    tokens: BN;
    /** Quote spent, fees included, in the curve's quote mint base units. */
    quoteAmount: BN;
    /** Curve quote mint (wrapped SOL for SOL-paired coins). */
    quoteMint: string;
    /**
     * True when the buy takes more than the curve's remaining supply, so it
     * completes the curve and continues into the new pool (synthetic migration).
     */
    crossesCurve: boolean;
}

async function fetchV3State(connection: Connection, mint: PublicKey, user: PublicKey) {
    const official = await import('@pump-fun/pump-sdk');
    const sdk = new official.OnlinePumpSdk(connection);
    const [global, feeConfig, buyState] = await Promise.all([
        sdk.fetchGlobal(),
        sdk.fetchFeeConfig(),
        sdk.fetchBuyState(mint, user),
    ]);
    const mintSupply = await fetchMintSupply(connection, mint, buyState.bondingCurve);
    return { official, global, feeConfig, mintSupply, ...buyState };
}

/**
 * Quote `buy_exact_quote_in_v3`: the tokens `quoteAmount` buys, fees
 * included. Past the curve's remaining supply the leftover budget buys from
 * the pool-to-be, exactly as the program does. Apply slippage to `tokens`
 * for `min_tokens_out`. Returns null when the curve does not exist or is
 * complete (every trade is refused until the migration lands).
 */
export async function getBuyV3Quote(
    connection: Connection,
    mint: PublicKey,
    user: PublicKey,
    quoteAmount: BN,
): Promise<BuyV3Quote | null> {
    try {
        const state = await fetchV3State(connection, mint, user);
        if (state.bondingCurve.complete) return null;
        const tokens = state.official.getBuyV3TokenAmountFromQuoteAmount({
            global: state.global,
            feeConfig: state.feeConfig,
            mintSupply: state.mintSupply,
            bondingCurve: state.bondingCurve,
            amount: quoteAmount,
            curveBaseTokenBalance: state.curveBaseTokenBalance,
        });
        return {
            tokens: new BN(tokens.toString()),
            quoteAmount,
            quoteMint: state.quoteMint.toBase58(),
            crossesCurve: tokens.gt(state.bondingCurve.realTokenReserves),
        };
    } catch {
        return null;
    }
}

/**
 * Quote `buy_v3`: what `tokenAmount` tokens cost, fees included (the
 * `max_sol_cost` cap before slippage). Includes the post-completion leg when
 * the amount exceeds the remaining supply. Returns null when the curve does
 * not exist, is complete, or the amount would take the whole pool-to-be.
 */
export async function getBuyV3Cost(
    connection: Connection,
    mint: PublicKey,
    user: PublicKey,
    tokenAmount: BN,
): Promise<BuyV3Quote | null> {
    try {
        const state = await fetchV3State(connection, mint, user);
        if (state.bondingCurve.complete) return null;
        const cost = state.official.getBuyV3QuoteAmountFromTokenAmount({
            global: state.global,
            feeConfig: state.feeConfig,
            mintSupply: state.mintSupply,
            bondingCurve: state.bondingCurve,
            amount: tokenAmount,
            curveBaseTokenBalance: state.curveBaseTokenBalance,
        });
        return {
            tokens: tokenAmount,
            quoteAmount: new BN(cost.toString()),
            quoteMint: state.quoteMint.toBase58(),
            crossesCurve: tokenAmount.gt(state.bondingCurve.realTokenReserves),
        };
    } catch {
        return null;
    }
}

// ── Creator fee sweeps (official @pump-fun/pump-sdk 4) ───────────────

export interface CreatorFeeSweep {
    /**
     * Sweep instructions to put first, in the same transaction, in front of
     * `collect_creator_fee(_v2)`, `collect_coin_creator_fee` or a fee sharing
     * distribution. Empty when no creator fee is waiting.
     */
    instructions: TransactionInstruction[];
    /** Creator fee v3 trades left on the bonding curve, in quote base units. */
    curveCreatorFee: BN;
    /** Creator fee PumpSwap v2 trades left in the canonical pool; zero before migration. */
    poolCreatorFee: BN;
    /** Curve quote mint (wrapped SOL for SOL-paired coins). */
    quoteMint: string;
    /** Canonical PumpSwap pool when the coin has migrated, else null. */
    pool: string | null;
}

/**
 * Build the permissionless `sweep_creator_fee` instructions (Pump curve and,
 * once migrated, the PumpSwap pool) that move the creator fee the new trade
 * instructions keep on the curve and in the pool into the creator vaults.
 * A collect without them misses those fees, and distribution, CTO and fee
 * share updates refuse to run while a creator bucket is nonzero
 * (`CreatorFeesNotSwept` 6095 / 6081, `PoolCreatorFeesNotSwept` 6033).
 *
 * `payer` signs the sweeps and covers the small rent they may need. Throws
 * when `mint` has no bonding curve.
 */
export async function getCreatorFeeSweepInstructions(
    connection: Connection,
    mint: PublicKey,
    payer: PublicKey,
): Promise<CreatorFeeSweep> {
    const official = await import('@pump-fun/pump-sdk');
    const sdk = new official.OnlinePumpSdk(connection);
    const curve = await sdk.fetchBondingCurve(mint);
    const quoteMint = official.normalizeQuoteMint(curve.quoteMint);
    const quoteTokenProgram = quoteMint.toBase58() === WSOL_MINT
        ? undefined
        : await sdk.fetchQuoteTokenProgram(quoteMint);

    const poolAddress = official.canonicalPumpPoolPdaWithQuote(mint, quoteMint);
    const poolInfo = await connection.getAccountInfo(poolAddress);
    const pool = poolInfo ? decodePumpPool(poolInfo.data) : null;

    const curveCreatorFee = new BN(curve.creatorFee.toString());
    const poolCreatorFee = new BN((pool?.creatorFees ?? 0n).toString());
    const instructions: TransactionInstruction[] = [];
    if (!curveCreatorFee.isZero()) {
        instructions.push(await official.PUMP_SDK.sweepCreatorFeeInstruction({
            payer, mint, creator: curve.creator, quoteMint, quoteTokenProgram,
        }));
    }
    if (pool && !poolCreatorFee.isZero()) {
        instructions.push(await official.PUMP_SDK.sweepPoolCreatorFeeInstruction({
            payer, mint, coinCreator: new PublicKey(pool.coinCreator), quoteMint, quoteTokenProgram,
        }));
    }
    return {
        instructions,
        curveCreatorFee,
        poolCreatorFee,
        quoteMint: quoteMint.toBase58(),
        pool: pool ? poolAddress.toBase58() : null,
    };
}
