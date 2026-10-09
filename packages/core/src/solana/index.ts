// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

/**
 * @pumpkit/core — Solana module barrel export
 */

export {
    getTokenPrice,
    getGraduationProgress,
    getBuyQuote,
    getSellQuote,
    getBondingCurveState,
    getBuyV3Quote,
    getBuyV3Cost,
    getCreatorFeeSweepInstructions,
} from './sdk-bridge.js';

export type { BondingCurveInfo, BuyV3Quote, CreatorFeeSweep } from './sdk-bridge.js';

export {
    PUMP_PROGRAM_ID,
    PUMP_AMM_PROGRAM_ID,
    PUMP_FEE_PROGRAM_ID,
    PUMPFUN_FEE_ACCOUNT,
    PUMP_FEE_RECIPIENTS,
    PUMP_FEE_RECIPIENT_SET,
    PUMPFUN_MIGRATION_AUTHORITY,
    WSOL_MINT,
    MONITORED_PROGRAM_IDS,
    CREATE_V2_DISCRIMINATOR,
    CREATE_DISCRIMINATOR,
    COMPLETE_EVENT_DISCRIMINATOR,
    TRADE_EVENT_DISCRIMINATOR,
    PUMP_GLOBAL, PUMP_EVENT_AUTHORITY, PUMP_AMM_EVENT_AUTHORITY,
    PUMP_FEE_CONFIG, PUMP_AMM_GLOBAL_CONFIG, PUMP_AMM_FEE_CONFIG, PUMP_QUOTE_CONTROL,
    FEE_KEPT_ON_CURVE_RECIPIENT, SWEEP_FEE_BUCKET,
    PUMP_ERROR_CODES, PUMP_AMM_ERROR_CODES, PUMP_FEES_ERROR_CODES,
    BUY_V3_DISCRIMINATOR, SELL_V3_DISCRIMINATOR, BUY_EXACT_QUOTE_IN_V3_DISCRIMINATOR,
    AMM_BUY_V2_DISCRIMINATOR, AMM_SELL_V2_DISCRIMINATOR, AMM_BUY_EXACT_QUOTE_IN_V2_DISCRIMINATOR,
    MULTI_HOP_SWAP_DISCRIMINATOR, MULTI_HOP_CURVE_SWAP_DISCRIMINATOR,
    SWEEP_PROTOCOL_FEE_DISCRIMINATOR, SWEEP_CREATOR_FEE_DISCRIMINATOR,
    COMPLETE_AMM_MIGRATION_EVENT_DISCRIMINATOR, POST_COMPLETE_BUY_EVENT_DISCRIMINATOR,
    SWEEP_BONDING_CURVE_FEE_EVENT_DISCRIMINATOR, SWEEP_POOL_FEE_EVENT_DISCRIMINATOR,
    AMM_BUY_EVENT_DISCRIMINATOR, AMM_SELL_EVENT_DISCRIMINATOR,
    PUMP_AMM_POOL_ACCOUNT_DISCRIMINATOR,
} from './programs.js';

export {
    decodeTradeEvent, decodePostCompleteBuyEvent, decodeCompleteEvent,
    decodeSweepBondingCurveFeeEvent, decodeSweepPoolFeeEvent, decodePumpPool,
    parsePumpLogEvents, aggregateTrades, effectivePoolQuoteReserves, isSolQuoteMint,
    type PumpTradeEvent, type PostCompleteBuyEvent, type PumpCompleteEvent,
    type SweepFeeEvent, type SweepBucket, type PumpLogEvent, type AggregatedTrade,
    type PumpPoolState,
} from './events.js';

export {
    createRpcConnection,
    deriveWsUrl,
    RpcFallback,
    type RpcOptions,
} from './rpc.js';

export {
    detectSeededByPump,
    type FundingSourceResult,
    type DetectSeededByPumpOptions,
} from './funding-source.js';
