// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//

/**
 * @pumpkit/core — Pump Protocol Event Types
 *
 * Events delivered by the PumpKit monitors. Every field is decoded from the
 * program's own event; nothing is filled with placeholders. Token names and
 * symbols are not part of most on-chain events, so look them up separately
 * when a message needs them. Amounts are `bigint` base units of `quoteMint`
 * (lamports when the quote is SOL or unknown). Timestamps are unix ms taken
 * from the event's block time.
 */

import type { CreatorChangeKind, FeeClaimKind } from '../solana/events.js';

interface ChainEvent {
  signature: string;
  slot: number;
  /** Unix ms, from the timestamp the program wrote into the event. */
  timestamp: number;
}

/** A fee claim: creator vault collection, cashback or social fee. */
export interface ClaimEvent extends ChainEvent {
  kind: FeeClaimKind;
  program: 'pump' | 'pump-amm' | 'pump-fees';
  /** Wallet that received the funds. */
  wallet: string;
  amount: bigint;
  /** `null` when the event does not name it (cashback, PumpSwap creator fees). */
  quoteMint: string | null;
}

/** New token creation event */
export interface LaunchEvent extends ChainEvent {
  mint: string;
  bondingCurve: string;
  /** Creator that earns creator fees. */
  creator: string;
  /** Signer that paid for the create. */
  user: string;
  /** Raw on-chain strings. Escape before putting them in a message. */
  name: string;
  symbol: string;
  uri: string;
  isMayhemMode: boolean;
  hasCashback: boolean;
  quoteMint: string | null;
}

/**
 * A bonding curve completing and/or migrating to its PumpSwap pool. A buy
 * that empties the curve now migrates in the same transaction; older coins
 * complete in one transaction and migrate in a later one, so the same mint
 * can produce one event with `curveCompleted` and a later one with only
 * `poolAddress`.
 */
export interface GraduationEvent extends ChainEvent {
  mint: string;
  bondingCurve: string;
  /** Signer of the transaction that completed or migrated the curve. */
  user: string;
  /** True when this transaction emitted the CompleteEvent. */
  curveCompleted: boolean;
  /** PumpSwap pool, when this transaction migrated the curve. */
  poolAddress: string | null;
  quoteMint: string | null;
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

/** A coin's fee-earning creator changed. */
export interface CTOEvent extends ChainEvent {
  kind: CreatorChangeKind;
  mint: string;
  bondingCurve: string;
  /** `null` for `set_creator`, whose event does not carry the previous creator. */
  oldCreator: string | null;
  newCreator: string;
}

/** Creator fees paid out to a coin's fee sharing shareholders. */
export interface FeeDistEvent extends ChainEvent {
  mint: string;
  sharingConfig: string;
  totalAmount: bigint;
  quoteMint: string | null;
  shareholders: Array<{ address: string; shareBps: number }>;
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
