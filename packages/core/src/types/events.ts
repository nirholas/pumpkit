// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

/**
 * @pumpkit/core — Pump Protocol Event Types
 *
 * Typed event interfaces for all on-chain events detected by PumpKit monitors.
 */

/** Fee claim event from Pump or PumpSwap programs */
export interface ClaimEvent {
  signature: string;
  wallet: string;
  mint: string;
  amount: number;
  tokenName?: string;
  tokenSymbol?: string;
  timestamp: number;
}

/** New token creation event */
export interface LaunchEvent {
  signature: string;
  mint: string;
  creator: string;
  name: string;
  symbol: string;
  uri: string;
  isMayhemMode: boolean;
  hasCashback: boolean;
  timestamp: number;
}

/** Token graduation from bonding curve to AMM */
export interface GraduationEvent {
  signature: string;
  mint: string;
  tokenName: string;
  tokenSymbol: string;
  poolAddress: string;
  finalMcap?: number;
  timestamp: number;
}

/** Large trade (whale) event */
export interface WhaleTradeEvent {
  signature: string;
  mint: string;
  trader: string;
  side: 'buy' | 'sell';
  /** SOL paid or received, fees included (UI units). */
  solAmount: number;
  /** Tokens bought or sold (UI units, 6 decimals). */
  tokenAmount: number;
  tokenSymbol?: string;
  progress?: number;
  timestamp: number;
  /** Instruction that produced the trade, e.g. `buy_v3`, `sell_v3`, `multi_hop_swap`. */
  instruction?: string;
  /** True when the buy emptied the curve and continued into the new pool (synthetic migration). */
  syntheticMigration?: boolean;
}

/** Creator transfer / takeover event */
export interface CTOEvent {
  signature: string;
  mint: string;
  oldCreator: string;
  newCreator: string;
  timestamp: number;
}

/** Fee distribution event */
export interface FeeDistEvent {
  signature: string;
  mint: string;
  totalAmount: number;
  shareholders: Array<{ address: string; amount: number }>;
  timestamp: number;
}

/** Union of all Pump protocol events */
export type PumpEventUnion =
  | ClaimEvent
  | LaunchEvent
  | GraduationEvent
  | WhaleTradeEvent
  | CTOEvent
  | FeeDistEvent;

/** Event type discriminator strings */
export type PumpEventType =
  | 'claim'
  | 'launch'
  | 'graduation'
  | 'whale'
  | 'cto'
  | 'distribution';
