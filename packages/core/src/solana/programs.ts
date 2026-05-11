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

// ── Instruction Discriminators ────────────────────────────────────────

/** create_v2 instruction on Pump program */
export const CREATE_V2_DISCRIMINATOR = Buffer.from([
  0x19, 0xe0, 0x63, 0x50, 0x0d, 0x7a, 0xd8, 0x33,
]);

/** create (v1, deprecated) instruction on Pump program */
export const CREATE_DISCRIMINATOR = Buffer.from([
  0x18, 0x1e, 0xc8, 0x28, 0x05, 0x1c, 0x07, 0x77,
]);

/** CompleteEvent discriminator */
export const COMPLETE_EVENT_DISCRIMINATOR = Buffer.from([
  0xe9, 0x17, 0x0d, 0x1e, 0x0e, 0x10, 0x6c, 0x28,
]);

/** TradeEvent discriminator */
export const TRADE_EVENT_DISCRIMINATOR = Buffer.from([
  0xe4, 0x52, 0xf2, 0xd2, 0xb2, 0x32, 0xd1, 0x09,
]);
