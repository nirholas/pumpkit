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
 * Requires @nirholas/pump-sdk as a peer dependency.
 */

import type { Connection } from '@solana/web3.js';
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
    // mintSupply is the user-held supply: totalSupply - virtualTokenReserves
    const mintSupply = bondingCurve.tokenTotalSupply.sub(bondingCurve.virtualTokenReserves);
    return { global, feeConfig, bondingCurve, mintSupply };
}

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
