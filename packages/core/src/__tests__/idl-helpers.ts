// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt, https://x.com/nichxbt | https://github.com/nirholas

/**
 * Test helpers that build Pump events straight from the IDLs mirrored in
 * docs/pump-protocol/idl, so decoders are checked against the published
 * layout rather than against a hand-written copy of it.
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PublicKey } from '@solana/web3.js';

export const IDL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../docs/pump-protocol/idl');

export type IdlType = string | { vec: IdlType } | { defined: { name: string } };
export interface IdlField { name: string; type: IdlType }
export interface Idl {
  instructions: { name: string; discriminator: number[] }[];
  events: { name: string; discriminator: number[] }[];
  accounts: { name: string; discriminator: number[] }[];
  types: { name: string; type: { fields: IdlField[] } }[];
  errors: { name: string; code: number }[];
}

export const loadIdl = (name: string): Idl => JSON.parse(readFileSync(resolve(IDL_DIR, `${name}.json`), 'utf8')) as Idl;

export const ixDisc = (idl: Idl, name: string) => Buffer.from(idl.instructions.find((i) => i.name === name)!.discriminator);
export const eventDisc = (idl: Idl, name: string) => Buffer.from(idl.events.find((e) => e.name === name)!.discriminator);
export const anchorDisc = (preimage: string) => createHash('sha256').update(preimage).digest().subarray(0, 8);

export type Value = string | bigint | boolean | number | Value[] | { [key: string]: Value };

/** Minimal Borsh encoder driven by an IDL field list. */
export function encode(idl: Idl, fields: IdlField[], values: Record<string, Value>): Buffer {
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

export function encodeEvent(idl: Idl, name: string, values: Record<string, Value>): Buffer {
  const fields = idl.types.find((t) => t.name === name)!.type.fields;
  return Buffer.concat([eventDisc(idl, name), encode(idl, fields, values)]);
}
