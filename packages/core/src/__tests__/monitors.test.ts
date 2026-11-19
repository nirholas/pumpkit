// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt, https://x.com/nichxbt | https://github.com/nirholas

/**
 * Decoders for the launch, graduation, creator, claim and distribution
 * events, and the monitors built on them. Every event is encoded from the
 * IDL field lists, never from the decoder's own layout.
 */

import { describe, expect, it } from 'vitest';
import { Keypair, type Connection, type Logs } from '@solana/web3.js';

import * as programs from '../solana/programs.js';
import {
  decodeAmmMigrationEvent,
  decodeCreateEvent,
  decodeCreatorChangeEvent,
  decodeCreatorFeeDistributionEvent,
  decodeFeeClaimEvent,
  parsePumpLogEvents,
} from '../solana/events.js';
import { ClaimMonitor } from '../monitor/ClaimMonitor.js';
import { CTOMonitor } from '../monitor/CTOMonitor.js';
import { FeeDistMonitor } from '../monitor/FeeDistMonitor.js';
import { GraduationMonitor } from '../monitor/GraduationMonitor.js';
import { LaunchMonitor } from '../monitor/LaunchMonitor.js';
import { BoundedSet } from '../util/bounded-set.js';
import type { ClaimEvent, CTOEvent, FeeDistEvent, GraduationEvent, LaunchEvent } from '../types/events.js';
import { anchorDisc, encodeEvent, eventDisc, loadIdl, type Value } from './idl-helpers.js';

const pump = loadIdl('pump');
const amm = loadIdl('pump_amm');
const fees = loadIdl('pump_fees');

const key = () => Keypair.generate().publicKey.toBase58();
const MINT = key();
const CURVE = key();
const USER = key();
const CREATOR = key();
const POOL = key();
const TS = 1_790_000_000n;

const programData = (bytes: Buffer) => `Program data: ${bytes.toString('base64')}`;
const invoke = (programId: string, ...lines: string[]) => [
  `Program ${programId} invoke [1]`,
  ...lines,
  `Program ${programId} success`,
];

const createValues = (overrides: Record<string, Value> = {}): Record<string, Value> => ({
  name: 'Pump <Kitty>', symbol: 'KIT', uri: 'https://ipfs.io/ipfs/x', mint: MINT, bonding_curve: CURVE,
  user: USER, creator: CREATOR, timestamp: TS, virtual_token_reserves: 1n, virtual_sol_reserves: 2n,
  real_token_reserves: 3n, token_total_supply: 4n, token_program: programs.WSOL_MINT, is_mayhem_mode: true,
  is_cashback_enabled: true, quote_mint: programs.WSOL_MINT, virtual_quote_reserves: 0n, creator_fee_bps: 30n,
  is_holder_reward: false, depth: 0,
  ...overrides,
});

describe('new event discriminators match the IDLs', () => {
  it.each([
    ['CreateEvent', programs.CREATE_EVENT_DISCRIMINATOR],
    ['SetCreatorEvent', programs.SET_CREATOR_EVENT_DISCRIMINATOR],
    ['AdminCtoEvent', programs.ADMIN_CTO_EVENT_DISCRIMINATOR],
    ['MigrateBondingCurveCreatorEvent', programs.MIGRATE_BONDING_CURVE_CREATOR_EVENT_DISCRIMINATOR],
    ['CollectCreatorFeeEvent', programs.COLLECT_CREATOR_FEE_EVENT_DISCRIMINATOR],
    ['ClaimCashbackEvent', programs.CLAIM_CASHBACK_EVENT_DISCRIMINATOR],
    ['DistributeCreatorFeesEvent', programs.DISTRIBUTE_CREATOR_FEES_EVENT_DISCRIMINATOR],
  ] as const)('pump event %s', (name, value) => {
    expect(value.equals(eventDisc(pump, name))).toBe(true);
    expect(value.equals(anchorDisc(`event:${name}`))).toBe(true);
  });

  it('pump_amm CollectCoinCreatorFeeEvent and ClaimCashbackEvent', () => {
    expect(programs.COLLECT_COIN_CREATOR_FEE_EVENT_DISCRIMINATOR.equals(eventDisc(amm, 'CollectCoinCreatorFeeEvent'))).toBe(true);
    expect(programs.CLAIM_CASHBACK_EVENT_DISCRIMINATOR.equals(eventDisc(amm, 'ClaimCashbackEvent'))).toBe(true);
  });

  it('pump_fees SocialFeePdaClaimed', () => {
    expect(programs.SOCIAL_FEE_PDA_CLAIMED_EVENT_DISCRIMINATOR.equals(eventDisc(fees, 'SocialFeePdaClaimed'))).toBe(true);
  });
});

describe('decodeCreateEvent', () => {
  it('decodes every field a launch needs', () => {
    const ev = decodeCreateEvent(encodeEvent(pump, 'CreateEvent', createValues()))!;
    expect(ev).toMatchObject({
      name: 'Pump <Kitty>', symbol: 'KIT', uri: 'https://ipfs.io/ipfs/x', mint: MINT, bondingCurve: CURVE,
      user: USER, creator: CREATOR, timestamp: TS, tokenProgram: programs.WSOL_MINT, isMayhemMode: true,
      isCashbackEnabled: true, quoteMint: programs.WSOL_MINT,
    });
  });

  it('decodes an older event that stops after the timestamp', () => {
    const full = encodeEvent(pump, 'CreateEvent', createValues());
    const nameLen = 4 + 'Pump <Kitty>'.length;
    const prefix = 8 + nameLen + 4 + 3 + 4 + 'https://ipfs.io/ipfs/x'.length + 32 * 4 + 8;
    const ev = decodeCreateEvent(full.subarray(0, prefix))!;
    expect(ev.creator).toBe(CREATOR);
    expect(ev.quoteMint).toBeNull();
    expect(ev.tokenProgram).toBeNull();
  });

  it('returns null for a truncated name', () => {
    expect(decodeCreateEvent(encodeEvent(pump, 'CreateEvent', createValues()).subarray(0, 14))).toBeNull();
  });
});

describe('decodeAmmMigrationEvent', () => {
  it('decodes the pool', () => {
    const ev = decodeAmmMigrationEvent(
      encodeEvent(pump, 'CompletePumpAmmMigrationEvent', {
        user: USER, mint: MINT, mint_amount: 5n, sol_amount: 6n, pool_migration_fee: 7n, bonding_curve: CURVE,
        timestamp: TS, pool: POOL, quote_mint: programs.WSOL_MINT,
      }),
    )!;
    expect(ev).toMatchObject({ mint: MINT, pool: POOL, solAmount: 6n, quoteMint: programs.WSOL_MINT });
  });
});

describe('decodeCreatorChangeEvent', () => {
  const NEW = key();
  const OLD = key();

  it('decodes SetCreatorEvent, which has no previous creator', () => {
    const ev = decodeCreatorChangeEvent(
      encodeEvent(pump, 'SetCreatorEvent', { timestamp: TS, mint: MINT, bonding_curve: CURVE, creator: NEW }),
    );
    expect(ev).toEqual({ kind: 'set_creator', timestamp: TS, mint: MINT, bondingCurve: CURVE, oldCreator: null, newCreator: NEW });
  });

  it('decodes AdminCtoEvent', () => {
    const ev = decodeCreatorChangeEvent(
      encodeEvent(pump, 'AdminCtoEvent', {
        timestamp: TS, authority: key(), mint: MINT, bonding_curve: CURVE, old_creator: OLD, new_creator: NEW,
        is_holder_reward: false, is_cashback_coin: false, old_creator_fee_bps: 30n, new_creator_fee_bps: 30n,
        sharing_config_reset: false, swept_to_holder_vault: 0n, pool_updated: false,
      }),
    );
    expect(ev).toEqual({ kind: 'admin_cto', timestamp: TS, mint: MINT, bondingCurve: CURVE, oldCreator: OLD, newCreator: NEW });
  });

  it('decodes MigrateBondingCurveCreatorEvent', () => {
    const ev = decodeCreatorChangeEvent(
      encodeEvent(pump, 'MigrateBondingCurveCreatorEvent', {
        timestamp: TS, mint: MINT, bonding_curve: CURVE, sharing_config: key(), old_creator: OLD, new_creator: NEW,
      }),
    );
    expect(ev?.kind).toBe('migrate_to_sharing_config');
    expect(ev?.oldCreator).toBe(OLD);
    expect(ev?.newCreator).toBe(NEW);
  });
});

describe('decodeFeeClaimEvent', () => {
  it('decodes a Pump creator fee collection with its quote mint', () => {
    const bytes = encodeEvent(pump, 'CollectCreatorFeeEvent', {
      timestamp: TS, creator: CREATOR, creator_fee: 123n, quote_mint: programs.WSOL_MINT,
    });
    expect(decodeFeeClaimEvent(bytes, 'pump')).toEqual({
      kind: 'creator_fee', program: 'pump', wallet: CREATOR, amount: 123n, quoteMint: programs.WSOL_MINT, timestamp: TS,
    });
  });

  it('decodes a PumpSwap creator fee collection', () => {
    const bytes = encodeEvent(amm, 'CollectCoinCreatorFeeEvent', {
      timestamp: TS, coin_creator: CREATOR, coin_creator_fee: 456n, coin_creator_vault_ata: key(),
      coin_creator_token_account: key(),
    });
    expect(decodeFeeClaimEvent(bytes, 'pump-amm')).toMatchObject({ kind: 'amm_creator_fee', wallet: CREATOR, amount: 456n });
  });

  it('decodes cashback on either program', () => {
    const bytes = encodeEvent(pump, 'ClaimCashbackEvent', {
      user: USER, amount: 789n, timestamp: TS, total_claimed: 1n, total_cashback_earned: 2n,
    });
    expect(decodeFeeClaimEvent(bytes, 'pump')).toMatchObject({ kind: 'cashback', wallet: USER, amount: 789n, timestamp: TS });
    expect(decodeFeeClaimEvent(bytes, 'pump-amm')?.program).toBe('pump-amm');
  });

  it('decodes a social fee claim and pays the recipient', () => {
    const RECIPIENT = key();
    const bytes = encodeEvent(fees, 'SocialFeePdaClaimed', {
      timestamp: TS, user_id: '12345', platform: 1, social_fee_pda: key(), recipient: RECIPIENT,
      social_claim_authority: key(), amount_claimed: 1_000n, claimable_before: 2_000n, lifetime_claimed: 3_000n,
      recipient_balance_before: 0n, recipient_balance_after: 1_000n, quote_mint: programs.WSOL_MINT,
      lifetime_stable_claimed: 0n,
    });
    expect(decodeFeeClaimEvent(bytes, 'pump-fees')).toEqual({
      kind: 'social_fee', program: 'pump-fees', wallet: RECIPIENT, amount: 1_000n, quoteMint: programs.WSOL_MINT, timestamp: TS,
    });
  });

  it('ignores an event emitted by the wrong program', () => {
    const bytes = encodeEvent(pump, 'CollectCreatorFeeEvent', {
      timestamp: TS, creator: CREATOR, creator_fee: 1n, quote_mint: programs.WSOL_MINT,
    });
    expect(decodeFeeClaimEvent(bytes, 'pump-amm')).toBeNull();
  });
});

describe('decodeCreatorFeeDistributionEvent', () => {
  it('decodes shareholders and the total', () => {
    const A = key();
    const B = key();
    const ev = decodeCreatorFeeDistributionEvent(
      encodeEvent(pump, 'DistributeCreatorFeesEvent', {
        timestamp: TS, mint: MINT, bonding_curve: CURVE, sharing_config: key(), admin: key(),
        shareholders: [{ address: A, share_bps: 6_000 }, { address: B, share_bps: 4_000 }],
        distributed: 10_000n, quote_mint: programs.WSOL_MINT,
      }),
    )!;
    expect(ev.shareholders).toEqual([{ address: A, shareBps: 6_000 }, { address: B, shareBps: 4_000 }]);
    expect(ev.distributed).toBe(10_000n);
    expect(ev.quoteMint).toBe(programs.WSOL_MINT);
  });
});

describe('parsePumpLogEvents routes events by emitting program', () => {
  it('reads PumpFees claims only inside a PumpFees invocation', () => {
    const claim = encodeEvent(fees, 'SocialFeePdaClaimed', {
      timestamp: TS, user_id: 'u', platform: 1, social_fee_pda: key(), recipient: USER, social_claim_authority: key(),
      amount_claimed: 1n, claimable_before: 1n, lifetime_claimed: 1n, recipient_balance_before: 0n,
      recipient_balance_after: 1n, quote_mint: programs.WSOL_MINT, lifetime_stable_claimed: 0n,
    });
    expect(parsePumpLogEvents(invoke(programs.PUMP_FEE_PROGRAM_ID, programData(claim)))).toHaveLength(1);
    expect(parsePumpLogEvents(invoke(programs.PUMP_PROGRAM_ID, programData(claim)))).toHaveLength(0);
  });
});

// ── Monitors ─────────────────────────────────────────────────────────

/** Connection stand-in that records subscriptions; monitors only call these two methods. */
function fakeConnection() {
  const subscribed: string[] = [];
  const removed: number[] = [];
  const connection = {
    onLogs: (programId: { toBase58(): string }) => {
      subscribed.push(programId.toBase58());
      return subscribed.length;
    },
    removeOnLogsListener: async (id: number) => {
      removed.push(id);
    },
  } as unknown as Connection;
  return { connection, subscribed, removed };
}

const logs = (signature: string, lines: string[], err: Logs['err'] = null): Logs => ({ signature, logs: lines, err });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('LaunchMonitor', () => {
  it('emits a launch with decoded fields and skips duplicates and failed transactions', async () => {
    const { connection, subscribed } = fakeConnection();
    const seen: LaunchEvent[] = [];
    const monitor = new LaunchMonitor({ connection, onLaunch: (e) => void seen.push(e) });
    monitor.start();
    expect(subscribed).toEqual([programs.PUMP_PROGRAM_ID]);

    const lines = invoke(programs.PUMP_PROGRAM_ID, programData(encodeEvent(pump, 'CreateEvent', createValues())));
    monitor.handleLogs(logs('sig1', lines), 42);
    monitor.handleLogs(logs('sig1', lines), 42);
    monitor.handleLogs(logs('sig2', lines, { InstructionError: [0, 'InvalidArgument'] }), 43);
    await flush();

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      signature: 'sig1', slot: 42, mint: MINT, creator: CREATOR, name: 'Pump <Kitty>', symbol: 'KIT',
      hasCashback: true, isMayhemMode: true, timestamp: Number(TS) * 1000,
    });
    expect(monitor.status().eventsProcessed).toBe(1);
  });

  it('isolates a throwing callback', async () => {
    const { connection } = fakeConnection();
    const monitor = new LaunchMonitor({
      connection,
      onLaunch: () => {
        throw new Error('boom');
      },
    });
    const lines = invoke(programs.PUMP_PROGRAM_ID, programData(encodeEvent(pump, 'CreateEvent', createValues())));
    expect(() => monitor.handleLogs(logs('sig', lines), 1)).not.toThrow();
    await flush();
  });

  it('removes its subscription on stop', () => {
    const { connection, removed } = fakeConnection();
    const monitor = new LaunchMonitor({ connection, onLaunch: () => undefined });
    monitor.start();
    monitor.stop();
    expect(removed).toEqual([1]);
    expect(monitor.status().running).toBe(false);
  });
});

describe('GraduationMonitor', () => {
  const complete = encodeEvent(pump, 'CompleteEvent', {
    user: USER, mint: MINT, bonding_curve: CURVE, timestamp: TS, quote_mint: programs.WSOL_MINT,
  });
  const migration = encodeEvent(pump, 'CompletePumpAmmMigrationEvent', {
    user: USER, mint: MINT, mint_amount: 1n, sol_amount: 1n, pool_migration_fee: 1n, bonding_curve: CURVE,
    timestamp: TS, pool: POOL, quote_mint: programs.WSOL_MINT,
  });

  it('merges completion and migration in one transaction', async () => {
    const { connection } = fakeConnection();
    const seen: GraduationEvent[] = [];
    const monitor = new GraduationMonitor({ connection, onGraduation: (e) => void seen.push(e) });
    monitor.handleLogs(logs('sig', invoke(programs.PUMP_PROGRAM_ID, programData(complete), programData(migration))), 7);
    await flush();
    expect(seen).toEqual([{
      signature: 'sig', slot: 7, timestamp: Number(TS) * 1000, mint: MINT, bondingCurve: CURVE, user: USER,
      curveCompleted: true, poolAddress: POOL, quoteMint: programs.WSOL_MINT,
    }]);
  });

  it('reports a completion without a pool', async () => {
    const { connection } = fakeConnection();
    const seen: GraduationEvent[] = [];
    const monitor = new GraduationMonitor({ connection, onGraduation: (e) => void seen.push(e) });
    monitor.handleLogs(logs('sig', invoke(programs.PUMP_PROGRAM_ID, programData(complete))), 7);
    await flush();
    expect(seen[0]).toMatchObject({ curveCompleted: true, poolAddress: null });
  });
});

describe('ClaimMonitor', () => {
  it('subscribes to all three programs and de-duplicates across them', async () => {
    const { connection, subscribed } = fakeConnection();
    const seen: ClaimEvent[] = [];
    const monitor = new ClaimMonitor({ connection, onClaim: (e) => void seen.push(e) });
    monitor.start();
    expect(subscribed).toEqual([programs.PUMP_PROGRAM_ID, programs.PUMP_AMM_PROGRAM_ID, programs.PUMP_FEE_PROGRAM_ID]);

    const lines = invoke(
      programs.PUMP_PROGRAM_ID,
      programData(encodeEvent(pump, 'CollectCreatorFeeEvent', {
        timestamp: TS, creator: CREATOR, creator_fee: 2_500_000_000n, quote_mint: programs.WSOL_MINT,
      })),
    );
    // The same transaction arrives once per subscription that mentions it.
    monitor.handleLogs(logs('sig', lines), 9);
    monitor.handleLogs(logs('sig', lines), 9);
    await flush();
    expect(seen).toEqual([{
      signature: 'sig', slot: 9, timestamp: Number(TS) * 1000, kind: 'creator_fee', program: 'pump',
      wallet: CREATOR, amount: 2_500_000_000n, quoteMint: programs.WSOL_MINT,
    }]);
  });

  it('ignores trades', async () => {
    const { connection } = fakeConnection();
    const seen: ClaimEvent[] = [];
    const monitor = new ClaimMonitor({ connection, onClaim: (e) => void seen.push(e) });
    monitor.handleLogs(logs('sig', invoke(programs.PUMP_PROGRAM_ID, programData(encodeEvent(pump, 'CompleteEvent', {
      user: USER, mint: MINT, bonding_curve: CURVE, timestamp: TS, quote_mint: programs.WSOL_MINT,
    })))), 1);
    await flush();
    expect(seen).toEqual([]);
  });
});

describe('CTOMonitor and FeeDistMonitor', () => {
  it('CTOMonitor reports an admin takeover', async () => {
    const { connection } = fakeConnection();
    const seen: CTOEvent[] = [];
    const monitor = new CTOMonitor({ connection, onCTO: (e) => void seen.push(e) });
    const NEW = key();
    monitor.handleLogs(logs('sig', invoke(programs.PUMP_PROGRAM_ID, programData(encodeEvent(pump, 'AdminCtoEvent', {
      timestamp: TS, authority: key(), mint: MINT, bonding_curve: CURVE, old_creator: CREATOR, new_creator: NEW,
      is_holder_reward: false, is_cashback_coin: false, old_creator_fee_bps: 30n, new_creator_fee_bps: 30n,
      sharing_config_reset: false, swept_to_holder_vault: 0n, pool_updated: false,
    })))), 3);
    await flush();
    expect(seen[0]).toMatchObject({ kind: 'admin_cto', mint: MINT, oldCreator: CREATOR, newCreator: NEW, slot: 3 });
  });

  it('FeeDistMonitor reports a payout', async () => {
    const { connection } = fakeConnection();
    const seen: FeeDistEvent[] = [];
    const monitor = new FeeDistMonitor({ connection, onFeeDist: (e) => void seen.push(e) });
    const CONFIG = key();
    monitor.handleLogs(logs('sig', invoke(programs.PUMP_PROGRAM_ID, programData(encodeEvent(pump, 'DistributeCreatorFeesEvent', {
      timestamp: TS, mint: MINT, bonding_curve: CURVE, sharing_config: CONFIG, admin: key(),
      shareholders: [{ address: USER, share_bps: 10_000 }], distributed: 99n, quote_mint: programs.WSOL_MINT,
    })))), 4);
    await flush();
    expect(seen[0]).toMatchObject({
      mint: MINT, sharingConfig: CONFIG, totalAmount: 99n, shareholders: [{ address: USER, shareBps: 10_000 }],
    });
  });
});

describe('BoundedSet', () => {
  it('reports duplicates and evicts the oldest entry past capacity', () => {
    const set = new BoundedSet<string>(2);
    expect(set.add('a')).toBe(true);
    expect(set.add('a')).toBe(false);
    set.add('b');
    set.add('c');
    expect(set.size).toBe(2);
    expect(set.has('a')).toBe(false);
    expect(set.has('c')).toBe(true);
  });

  it('rejects a non-positive capacity', () => {
    expect(() => new BoundedSet(0)).toThrow(RangeError);
  });
});
