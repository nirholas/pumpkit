// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

/**
 * @pumpkit/core — Solana Program Constants
 *
 * Program IDs, known accounts, and instruction discriminators
 * for the Pump protocol ecosystem.
 */

/** Pump bonding curve program */
export const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

/** PumpSwap AMM program */
export const PUMP_AMM_PROGRAM_ID = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';

/** PumpFees program */
export const PUMP_FEE_PROGRAM_ID = 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ';

/** PumpFun fee recipient account (legacy — pre-April-28 2025 upgrade) */
export const PUMPFUN_FEE_ACCOUNT = 'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbCJ5GEFDM97zC';

/**
 * Pump fee recipients added in the April 28 2025 program upgrade.
 * Buy/sell instructions now include one of these at the end of the accounts list
 * (bonding curve: after bonding-curve-v2; AMM: two accounts after pool-v2).
 */
export const PUMP_FEE_RECIPIENTS = [
  '5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD',
  '9M4giFFMxmFGXtc3feFzRai56WbBqehoSeRE5GK7gf7',
  'GXPFM2caqTtQYC2cJ5yJRi9VDkpsYZXzYdwYpGnLmtDL',
  '3BpXnfJaUTiwXnJNe7Ej1rcbzqTTQUvLShZaWazebsVR',
  '5cjcW9wExnJJiqgLjq7DEG75Pm6JBgE1hNv4B2vHXUW6',
  'EHAAiTxcdDwQ3U4bU6YcMsQGaekdzLS3B5SmYo46kJtL',
  '5eHhjP8JaYkz83CWwvGU2uMUXefd3AazWGx4gpcuEEYD',
  'A7hAgCzFw14fejgCp387JUJRMNyz4j89JKnhtKU8piqW',
] as const;

/** Set of all pump fee recipients for O(1) membership checks */
export const PUMP_FEE_RECIPIENT_SET = new Set<string>([
  PUMPFUN_FEE_ACCOUNT,
  ...PUMP_FEE_RECIPIENTS,
]);

/** PumpFun migration authority */
export const PUMPFUN_MIGRATION_AUTHORITY = '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg';

/** Wrapped SOL mint */
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

/** All monitored program IDs */
export const MONITORED_PROGRAM_IDS = [
  PUMP_PROGRAM_ID,
  PUMP_AMM_PROGRAM_ID,
  PUMP_FEE_PROGRAM_ID,
] as const;

/** Pump `Global` account (PDA `["global"]`). */
export const PUMP_GLOBAL = '4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf';

/** Pump event authority (PDA `["__event_authority"]`). */
export const PUMP_EVENT_AUTHORITY = 'Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1';

/** PumpSwap event authority (PDA `["__event_authority"]`). */
export const PUMP_AMM_EVENT_AUTHORITY = 'GS4CU59F31iL7aR2Q8zVS8DRrcRnXX1yjQ66TqNVQnaR';

/** Pump `FeeConfig` (fees program PDA for the Pump program); account 12 of every v3 trade. */
export const PUMP_FEE_CONFIG = '8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt';

/** PumpSwap `GlobalConfig`; account 2 of every v2 trade. */
export const PUMP_AMM_GLOBAL_CONFIG = 'ADyA8hdefvWN2dbGGWFotbzWxrAvLW83WG6QCVXvJKqw';

/** PumpSwap `FeeConfig` (fees program PDA for the PumpSwap program); account 13 of every v2 trade. */
export const PUMP_AMM_FEE_CONFIG = '5PHirr8joyTMp9JMm6nW7hNDVyEYdkzDqazxPD7RaTjx';

/** Pump `QuoteControl` account, passed to `create_v2` when the quote mint is a pump coin. */
export const PUMP_QUOTE_CONTROL = '6z6GDdfb2AjR9ZhJmAUQ5cipJCVxQvLJhB2H8mCwTFBP';

/**
 * `TradeEvent.fee_recipient` on a v3 trade (and on a multi-hop curve hop).
 * The zero key means the protocol fee was kept on the curve until a
 * `sweep_protocol_fee`, not paid to a fee recipient in the trade.
 */
export const FEE_KEPT_ON_CURVE_RECIPIENT = '11111111111111111111111111111111';

/** Fee bucket reported by `SweepBondingCurveFeeEvent` and `SweepPoolFeeEvent`. */
export const SWEEP_FEE_BUCKET = {
  protocol: 0,
  creator: 1,
} as const;

/**
 * Custom error codes introduced by the October 2026 trade upgrade, per program.
 * Values come from the IDLs in docs/pump-protocol/idl.
 */
export const PUMP_ERROR_CODES = {
  CashbackCoinNotSupported: 6094,
  CreatorFeesNotSwept: 6095,
  MultiHopDiscontinuousPath: 6098,
  MultiHopMayhemCurveNotSupported: 6108,
} as const;

export const PUMP_AMM_ERROR_CODES = {
  CashbackCoinNotSupported: 6079,
  MayhemPoolNotSupported: 6080,
  CreatorFeesNotSwept: 6081,
  MultiHopDiscontinuousPath: 6084,
  MultiHopMixedDirection: 6086,
} as const;

export const PUMP_FEES_ERROR_CODES = {
  PoolCreatorFeesNotSwept: 6033,
} as const;

// ── Instruction Discriminators ────────────────────────────────────────
// Anchor discriminators, copied from the official IDLs (docs/pump-protocol/idl).
// `src/__tests__/programs.test.ts` re-derives every value from those IDLs.

const hex = (h: string): Buffer => Buffer.from(h, 'hex');

/** create_v2 instruction on Pump program */
export const CREATE_V2_DISCRIMINATOR = hex('d6904cec5f8b31b4');

/** create (v1, deprecated) instruction on Pump program */
export const CREATE_DISCRIMINATOR = hex('181ec828051c0777');

/** Pump bonding curve trades: v3 (17 accounts, fees kept on the curve). */
export const BUY_V3_DISCRIMINATOR = hex('07051dc4f5176550');
export const SELL_V3_DISCRIMINATOR = hex('1c92de7726c469d5');
export const BUY_EXACT_QUOTE_IN_V3_DISCRIMINATOR = hex('e1f7501ed5b38488');

/** PumpSwap trades: v2 (17 accounts, fees kept in the pool). */
export const AMM_BUY_V2_DISCRIMINATOR = hex('b817ee6167c5d33d');
export const AMM_SELL_V2_DISCRIMINATOR = hex('5df6823ce7e940b2');
export const AMM_BUY_EXACT_QUOTE_IN_V2_DISCRIMINATOR = hex('c2ab1c46684d5b2f');

/** PumpSwap `multi_hop_swap`: one instruction through several pools and curves. */
export const MULTI_HOP_SWAP_DISCRIMINATOR = hex('2b644913e9f66f94');

/** Pump `multi_hop_curve_swap`: the curve leg of a multi-hop swap, CPI only. */
export const MULTI_HOP_CURVE_SWAP_DISCRIMINATOR = hex('e19a7516d756f667');

/**
 * Permissionless fee sweeps. The names and discriminators are the same on
 * Pump (13 accounts) and PumpSwap (12 accounts); tell them apart by program ID.
 */
export const SWEEP_PROTOCOL_FEE_DISCRIMINATOR = hex('0830be07b644b7e5');
export const SWEEP_CREATOR_FEE_DISCRIMINATOR = hex('20f6bf3408c949ba');

// ── Event Discriminators ──────────────────────────────────────────────

/** CompleteEvent discriminator */
export const COMPLETE_EVENT_DISCRIMINATOR = hex('5f72619cd42e9808');

/** CompletePumpAmmMigrationEvent discriminator */
export const COMPLETE_AMM_MIGRATION_EVENT_DISCRIMINATOR = hex('bde95db95c94ea94');

/** TradeEvent discriminator */
export const TRADE_EVENT_DISCRIMINATOR = hex('bddb7fd34ee661ee');

/**
 * PostCompleteBuyEvent discriminator: the pool part of a buy that emptied the
 * curve (synthetic migration). Follows the TradeEvent and CompleteEvent.
 */
export const POST_COMPLETE_BUY_EVENT_DISCRIMINATOR = hex('6fb06d8b316cd5fb');

/** SweepBondingCurveFeeEvent discriminator (Pump). */
export const SWEEP_BONDING_CURVE_FEE_EVENT_DISCRIMINATOR = hex('742b4dbd117a482b');

/** SweepPoolFeeEvent discriminator (PumpSwap). */
export const SWEEP_POOL_FEE_EVENT_DISCRIMINATOR = hex('82a42461e48287a5');

/** PumpSwap `Pool` account discriminator. */
export const PUMP_AMM_POOL_ACCOUNT_DISCRIMINATOR = hex('f19a6d0411b16dbc');

/** PumpSwap BuyEvent / SellEvent discriminators. */
export const AMM_BUY_EVENT_DISCRIMINATOR = hex('67f4521f2cf57777');
export const AMM_SELL_EVENT_DISCRIMINATOR = hex('3e2f370aa503dc2a');
