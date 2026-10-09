// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt, https://x.com/nichxbt | https://github.com/nirholas

/**
 * Checks the discriminators in programs.ts and the decoders in events.ts
 * against the official Pump IDLs mirrored in docs/pump-protocol/idl.
 * Events are encoded straight from the IDL field lists, so a layout change
 * upstream fails here instead of in production.
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';

import * as programs from '../solana/programs.js';
import {
  aggregateTrades,
  decodeCompleteEvent,
  decodePumpPool,
  decodePostCompleteBuyEvent,
  decodeSweepBondingCurveFeeEvent,
  decodeSweepPoolFeeEvent,
  decodeTradeEvent,
  effectivePoolQuoteReserves,
  isSolQuoteMint,
  parsePumpLogEvents,
} from '../solana/events.js';

// ── IDL helpers ──────────────────────────────────────────────────────

const IDL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../docs/pump-protocol/idl');

type IdlType = string | { vec: IdlType } | { defined: { name: string } };
interface IdlField { name: string; type: IdlType }
interface Idl {
  instructions: { name: string; discriminator: number[] }[];
  events: { name: string; discriminator: number[] }[];
  accounts: { name: string; discriminator: number[] }[];
  types: { name: string; type: { fields: IdlField[] } }[];
  errors: { name: string; code: number }[];
}

const loadIdl = (name: string): Idl => JSON.parse(readFileSync(resolve(IDL_DIR, `${name}.json`), 'utf8')) as Idl;
const pump = loadIdl('pump');
const amm = loadIdl('pump_amm');

const ixDisc = (idl: Idl, name: string) => Buffer.from(idl.instructions.find((i) => i.name === name)!.discriminator);
const eventDisc = (idl: Idl, name: string) => Buffer.from(idl.events.find((e) => e.name === name)!.discriminator);
const anchorDisc = (preimage: string) => createHash('sha256').update(preimage).digest().subarray(0, 8);

type Value = string | bigint | boolean | number | Value[] | { [key: string]: Value };

/** Minimal Borsh encoder driven by an IDL field list. */
function encode(idl: Idl, fields: IdlField[], values: Record<string, Value>): Buffer {
  const parts: Buffer[] = [];
  const write = (type: IdlType, value: Value): void => {
    if (typeof type === 'object' && 'vec' in type) {
      const items = value as Value[];
      const len = Buffer.alloc(4);
      len.writeUInt32LE(items.length);
      parts.push(len);
      for (const item of items) write(type.vec, item);
      return;
    }
    if (typeof type === 'object' && 'defined' in type) {
      const def = idl.types.find((t) => t.name === type.defined.name)!;
      for (const f of def.type.fields) write(f.type, (value as Record<string, Value>)[f.name]!);
      return;
    }
    const buf = (size: number, fn: (b: Buffer) => void) => {
      const b = Buffer.alloc(size);
      fn(b);
      parts.push(b);
    };
    switch (type) {
      case 'pubkey': parts.push(Buffer.from(new PublicKey(value as string).toBytes())); return;
      case 'u64': return buf(8, (b) => b.writeBigUInt64LE(value as bigint));
      case 'i64': return buf(8, (b) => b.writeBigInt64LE(value as bigint));
      case 'i128': return buf(16, (b) => {
        const v = value as bigint;
        b.writeBigUInt64LE(v & 0xffff_ffff_ffff_ffffn, 0);
        b.writeBigInt64LE(v >> 64n, 8);
      });
      case 'u16': return buf(2, (b) => b.writeUInt16LE(value as number));
      case 'u8': return buf(1, (b) => b.writeUInt8(value as number));
      case 'bool': return buf(1, (b) => b.writeUInt8(value ? 1 : 0));
      case 'string': {
        const s = Buffer.from(value as string, 'utf8');
        buf(4, (b) => b.writeUInt32LE(s.length));
        parts.push(s);
        return;
      }
      default: throw new Error(`test encoder does not handle IDL type ${JSON.stringify(type)}`);
    }
  };
  for (const f of fields) {
    if (!(f.name in values)) throw new Error(`missing value for ${f.name}`);
    write(f.type, values[f.name]!);
  }
  return Buffer.concat(parts);
}

function encodeEvent(idl: Idl, name: string, values: Record<string, Value>): Buffer {
  const fields = idl.types.find((t) => t.name === name)!.type.fields;
  return Buffer.concat([eventDisc(idl, name), encode(idl, fields, values)]);
}

const key = () => Keypair.generate().publicKey.toBase58();
const MINT = key();
const USER = key();
const CREATOR = key();
const CURVE = key();

function tradeValues(overrides: Record<string, Value> = {}): Record<string, Value> {
  return {
    mint: MINT, sol_amount: 2_000_000_000n, token_amount: 50_000_000_000n, is_buy: true, user: USER,
    timestamp: 1_790_000_000n, virtual_sol_reserves: 40_000_000_000n, virtual_token_reserves: 800_000_000_000_000n,
    real_sol_reserves: 10_000_000_000n, real_token_reserves: 500_000_000_000_000n,
    fee_recipient: programs.FEE_KEPT_ON_CURVE_RECIPIENT, fee_basis_points: 95n, fee: 19_000_000n,
    creator: CREATOR, creator_fee_basis_points: 30n, creator_fee: 6_000_000n,
    track_volume: true, total_unclaimed_tokens: 0n, total_claimed_tokens: 0n, current_sol_volume: 0n,
    last_update_timestamp: 0n, ix_name: 'buy_v3', mayhem_mode: false,
    cashback_fee_basis_points: 0n, cashback: 0n, buyback_fee_basis_points: 5n, buyback_fee: 1_000_000n,
    shareholders: [{ address: key(), share_bps: 7_000 }, { address: key(), share_bps: 3_000 }],
    quote_mint: programs.WSOL_MINT, quote_amount: 2_000_000_000n, virtual_quote_reserves: 40_000_000_000n,
    real_quote_reserves: 10_000_000_000n, holder_rewards_bps: 0n, holder_rewards: 0n, creator_fee_unclaimed: 6_000_000n,
    ...overrides,
  };
}

const programData = (bytes: Buffer) => `Program data: ${bytes.toString('base64')}`;

// ── Discriminators ───────────────────────────────────────────────────

describe('program discriminators match the official IDLs', () => {
  const pumpIx: [string, Buffer][] = [
    ['create', programs.CREATE_DISCRIMINATOR],
    ['create_v2', programs.CREATE_V2_DISCRIMINATOR],
    ['buy_v3', programs.BUY_V3_DISCRIMINATOR],
    ['sell_v3', programs.SELL_V3_DISCRIMINATOR],
    ['buy_exact_quote_in_v3', programs.BUY_EXACT_QUOTE_IN_V3_DISCRIMINATOR],
    ['multi_hop_curve_swap', programs.MULTI_HOP_CURVE_SWAP_DISCRIMINATOR],
    ['sweep_protocol_fee', programs.SWEEP_PROTOCOL_FEE_DISCRIMINATOR],
    ['sweep_creator_fee', programs.SWEEP_CREATOR_FEE_DISCRIMINATOR],
  ];
  const ammIx: [string, Buffer][] = [
    ['buy_v2', programs.AMM_BUY_V2_DISCRIMINATOR],
    ['sell_v2', programs.AMM_SELL_V2_DISCRIMINATOR],
    ['buy_exact_quote_in_v2', programs.AMM_BUY_EXACT_QUOTE_IN_V2_DISCRIMINATOR],
    ['multi_hop_swap', programs.MULTI_HOP_SWAP_DISCRIMINATOR],
    ['sweep_protocol_fee', programs.SWEEP_PROTOCOL_FEE_DISCRIMINATOR],
    ['sweep_creator_fee', programs.SWEEP_CREATOR_FEE_DISCRIMINATOR],
  ];
  const pumpEvents: [string, Buffer][] = [
    ['TradeEvent', programs.TRADE_EVENT_DISCRIMINATOR],
    ['CompleteEvent', programs.COMPLETE_EVENT_DISCRIMINATOR],
    ['CompletePumpAmmMigrationEvent', programs.COMPLETE_AMM_MIGRATION_EVENT_DISCRIMINATOR],
    ['PostCompleteBuyEvent', programs.POST_COMPLETE_BUY_EVENT_DISCRIMINATOR],
    ['SweepBondingCurveFeeEvent', programs.SWEEP_BONDING_CURVE_FEE_EVENT_DISCRIMINATOR],
  ];
  const ammEvents: [string, Buffer][] = [
    ['SweepPoolFeeEvent', programs.SWEEP_POOL_FEE_EVENT_DISCRIMINATOR],
    ['BuyEvent', programs.AMM_BUY_EVENT_DISCRIMINATOR],
    ['SellEvent', programs.AMM_SELL_EVENT_DISCRIMINATOR],
  ];

  it.each(pumpIx)('pump %s', (name, value) => {
    expect(value.equals(ixDisc(pump, name))).toBe(true);
    expect(value.equals(anchorDisc(`global:${name}`))).toBe(true);
  });
  it.each(ammIx)('pump_amm %s', (name, value) => {
    expect(value.equals(ixDisc(amm, name))).toBe(true);
  });
  it.each(pumpEvents)('pump event %s', (name, value) => {
    expect(value.equals(eventDisc(pump, name))).toBe(true);
    expect(value.equals(anchorDisc(`event:${name}`))).toBe(true);
  });
  it.each(ammEvents)('pump_amm event %s', (name, value) => {
    expect(value.equals(eventDisc(amm, name))).toBe(true);
  });

  it('error codes match the IDL error tables', () => {
    const code = (idl: Idl, name: string) => idl.errors.find((e) => e.name === name)?.code;
    for (const [name, value] of Object.entries(programs.PUMP_ERROR_CODES)) expect(code(pump, name)).toBe(value);
    for (const [name, value] of Object.entries(programs.PUMP_AMM_ERROR_CODES)) expect(code(amm, name)).toBe(value);
    const fees = loadIdl('pump_fees');
    for (const [name, value] of Object.entries(programs.PUMP_FEES_ERROR_CODES)) expect(code(fees, name)).toBe(value);
  });
});

// ── Decoders ─────────────────────────────────────────────────────────

describe('decodeTradeEvent', () => {
  it('decodes a v3 trade with every field present', () => {
    const ev = decodeTradeEvent(encodeEvent(pump, 'TradeEvent', tradeValues()))!;
    expect(ev.mint).toBe(MINT);
    expect(ev.user).toBe(USER);
    expect(ev.creator).toBe(CREATOR);
    expect(ev.solAmount).toBe(2_000_000_000n);
    expect(ev.tokenAmount).toBe(50_000_000_000n);
    expect(ev.isBuy).toBe(true);
    expect(ev.ixName).toBe('buy_v3');
    expect(ev.feeKeptOnCurve).toBe(true);
    expect(ev.buybackFee).toBe(1_000_000n);
    expect(ev.quoteMint).toBe(programs.WSOL_MINT);
    expect(ev.creatorFeeUnclaimed).toBe(6_000_000n);
  });

  it('decodes an event that predates the trailing fields', () => {
    const full = encodeEvent(pump, 'TradeEvent', tradeValues({ ix_name: 'buy', fee_recipient: programs.PUMPFUN_FEE_ACCOUNT }));
    const PREFIX = 8 + 32 + 8 + 8 + 1 + 32 + 8 + 32 + 32 + 8 + 8 + 32 + 8 + 8;
    const ev = decodeTradeEvent(full.subarray(0, PREFIX))!;
    expect(ev.solAmount).toBe(2_000_000_000n);
    expect(ev.feeKeptOnCurve).toBe(false);
    expect(ev.ixName).toBeNull();
    expect(ev.quoteMint).toBeNull();
    expect(ev.creatorFeeUnclaimed).toBeNull();
  });

  it('keeps decoding when the event grows new trailing fields', () => {
    const grown = Buffer.concat([encodeEvent(pump, 'TradeEvent', tradeValues()), Buffer.alloc(24, 7)]);
    expect(decodeTradeEvent(grown)!.creatorFeeUnclaimed).toBe(6_000_000n);
  });

  it('rejects other discriminators', () => {
    expect(decodeTradeEvent(Buffer.alloc(400))).toBeNull();
  });
});

describe('other events', () => {
  it('decodes CompleteEvent with and without quote_mint', () => {
    const bytes = encodeEvent(pump, 'CompleteEvent', { user: USER, mint: MINT, bonding_curve: CURVE, timestamp: 5n, quote_mint: programs.WSOL_MINT });
    expect(decodeCompleteEvent(bytes)).toEqual({ user: USER, mint: MINT, bondingCurve: CURVE, timestamp: 5n, quoteMint: programs.WSOL_MINT });
    expect(decodeCompleteEvent(bytes.subarray(0, bytes.length - 32))!.quoteMint).toBeNull();
  });

  it('decodes sweep events from both programs', () => {
    const recipient = key();
    const curveSweep = decodeSweepBondingCurveFeeEvent(encodeEvent(pump, 'SweepBondingCurveFeeEvent', {
      timestamp: 9n, mint: MINT, bonding_curve: CURVE, quote_mint: programs.WSOL_MINT, recipient, amount: 123n, bucket: 1,
    }))!;
    expect(curveSweep).toMatchObject({ program: 'pump', mint: MINT, account: CURVE, recipient, amount: 123n, bucket: 'creator', payer: null });

    const pool = key();
    const payer = key();
    const poolSweep = decodeSweepPoolFeeEvent(encodeEvent(amm, 'SweepPoolFeeEvent', {
      timestamp: 9n, pool, base_mint: MINT, quote_mint: programs.WSOL_MINT, recipient, payer, amount: 456n, bucket: 0,
    }))!;
    expect(poolSweep).toMatchObject({ program: 'pump-amm', mint: MINT, account: pool, payer, amount: 456n, bucket: 'protocol' });
  });
});

describe('parsePumpLogEvents + aggregateTrades', () => {
  const trade = encodeEvent(pump, 'TradeEvent', tradeValues());
  const complete = encodeEvent(pump, 'CompleteEvent', { user: USER, mint: MINT, bonding_curve: CURVE, timestamp: 5n, quote_mint: programs.WSOL_MINT });
  const post = encodeEvent(pump, 'PostCompleteBuyEvent', {
    user: USER, mint: MINT, bonding_curve: CURVE, quote_mint: programs.WSOL_MINT, timestamp: 5n,
    base_out: 1_000_000n, quote_in: 500_000_000n, fee_basis_points: 25n, fee: 1_250_000n,
    creator_fee_basis_points: 5n, creator_fee: 250_000n, buyback_fee: 100_000n,
    pool_base_reserves_before: 1n, pool_quote_reserves_before: 2n, pool_base_reserves_after: 3n, pool_quote_reserves_after: 4n,
  });

  it('folds a synthetic migration into one buy', () => {
    const logs = [
      `Program ${programs.PUMP_PROGRAM_ID} invoke [1]`,
      'Program log: Instruction: BuyV3',
      programData(trade),
      programData(complete),
      programData(post),
      `Program ${programs.PUMP_PROGRAM_ID} success`,
    ];
    const events = parsePumpLogEvents(logs);
    expect(events.map((e) => e.type)).toEqual(['trade', 'complete', 'postCompleteBuy']);
    const [buy] = aggregateTrades(events);
    expect(buy!.syntheticMigration).toBe(true);
    expect(buy!.solAmount).toBe(2_500_000_000n);
    expect(buy!.tokenAmount).toBe(50_001_000_000n);
    expect(buy!.fee).toBe(20_250_000n);
    expect(buy!.creatorFee).toBe(6_250_000n);
  });

  it('attributes sweep events to the program that emitted them', () => {
    const sweep = encodeEvent(amm, 'SweepPoolFeeEvent', {
      timestamp: 1n, pool: key(), base_mint: MINT, quote_mint: programs.WSOL_MINT, recipient: key(), payer: key(), amount: 7n, bucket: 1,
    });
    const otherProgram = key();
    const logs = [
      `Program ${programs.PUMP_AMM_PROGRAM_ID} invoke [1]`,
      programData(sweep),
      `Program ${programs.PUMP_AMM_PROGRAM_ID} success`,
      `Program ${otherProgram} invoke [1]`,
      programData(trade),
      `Program ${otherProgram} success`,
    ];
    const events = parsePumpLogEvents(logs);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'sweep', data: { program: 'pump-amm', amount: 7n, bucket: 'creator' } });
  });

  it('reads multi-hop curve hops emitted through a PumpSwap CPI', () => {
    const hop = encodeEvent(pump, 'TradeEvent', tradeValues({ ix_name: 'multi_hop_swap' }));
    const logs = [
      `Program ${programs.PUMP_AMM_PROGRAM_ID} invoke [1]`,
      `Program ${programs.PUMP_PROGRAM_ID} invoke [2]`,
      programData(hop),
      `Program ${programs.PUMP_PROGRAM_ID} success`,
      `Program ${programs.PUMP_AMM_PROGRAM_ID} success`,
    ];
    const [event] = parsePumpLogEvents(logs);
    expect(event).toMatchObject({ type: 'trade', data: { ixName: 'multi_hop_swap' } });
  });
});

describe('reserve and quote helpers', () => {
  it('adds a signed virtual_quote_reserves and treats a missing one as 0', () => {
    expect(effectivePoolQuoteReserves(1_000n, 250n)).toBe(1_250n);
    expect(effectivePoolQuoteReserves(1_000n, -400n)).toBe(600n);
    expect(effectivePoolQuoteReserves(1_000n, null)).toBe(1_000n);
    expect(effectivePoolQuoteReserves(1_000n, undefined)).toBe(1_000n);
    expect(() => effectivePoolQuoteReserves(100n, -101n)).toThrow(RangeError);
  });

  it('recognises SOL quote mints', () => {
    expect(isSolQuoteMint(null)).toBe(true);
    expect(isSolQuoteMint('11111111111111111111111111111111')).toBe(true);
    expect(isSolQuoteMint(programs.WSOL_MINT)).toBe(true);
    expect(isSolQuoteMint(key())).toBe(false);
  });
});

describe('decodePumpPool', () => {
  const poolDef = amm.types.find((t) => t.name === 'Pool')!;
  const accountDisc = Buffer.from(amm.accounts.find((a) => a.name === 'Pool')!.discriminator);
  const coinCreator = key();
  const quoteVault = key();
  const values: Record<string, Value> = {
    pool_bump: 254, index: 0, creator: key(), base_mint: MINT, quote_mint: programs.WSOL_MINT,
    lp_mint: key(), pool_base_token_account: key(), pool_quote_token_account: quoteVault,
    lp_supply: 1_000n, coin_creator: coinCreator, is_mayhem_mode: false, is_cashback_coin: false,
    virtual_quote_reserves: -123_456_789n, creator_fee_bps: 0n, can_edit_creator_fee: false,
    is_holder_reward: false, protocol_fees: 5_000n, creator_fees: 7_000n,
  };
  const full = () => Buffer.concat([accountDisc, encode(amm, poolDef.type.fields, values)]);

  it('uses the IDL account discriminator', () => {
    expect(programs.PUMP_AMM_POOL_ACCOUNT_DISCRIMINATOR.equals(accountDisc)).toBe(true);
    expect(accountDisc.equals(anchorDisc('account:Pool'))).toBe(true);
  });

  it('decodes the current layout, keeping virtual_quote_reserves signed', () => {
    const pool = decodePumpPool(full())!;
    expect(pool.baseMint).toBe(MINT);
    expect(pool.poolQuoteTokenAccount).toBe(quoteVault);
    expect(pool.coinCreator).toBe(coinCreator);
    expect(pool.virtualQuoteReserves).toBe(-123_456_789n);
    expect(pool.protocolFees).toBe(5_000n);
    expect(pool.creatorFees).toBe(7_000n);
    expect(effectivePoolQuoteReserves(200_000_000n, pool.virtualQuoteReserves)).toBe(76_543_211n);
  });

  it('reads trailing fields missing from pre-upgrade pools as zero', () => {
    const bytes = full();
    const beforeFees = decodePumpPool(bytes.subarray(0, 271))!;
    expect(beforeFees.virtualQuoteReserves).toBe(-123_456_789n);
    expect(beforeFees.protocolFees).toBe(0n);
    expect(beforeFees.creatorFees).toBe(0n);
    const oldest = decodePumpPool(bytes.subarray(0, 211))!;
    expect(oldest.coinCreator).toBe('11111111111111111111111111111111');
    expect(oldest.virtualQuoteReserves).toBe(0n);
    expect(decodePumpPool(bytes.subarray(0, 200))).toBeNull();
    expect(decodePumpPool(Buffer.concat([Buffer.alloc(8), bytes.subarray(8)]))).toBeNull();
  });
});
