// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

// ── Outsiders Bot — Token Price Service (DexScreener) ──────────────

import { log } from '@pumpkit/core/logger';
import type { Chain, TokenInfo } from './types.js';

let apiBase = 'https://api.dexscreener.com';

export function setApiBase(url: string): void {
  apiBase = url;
}

/** Resolve a contract address or chart URL to a clean token address + chain */
export function parseTokenInput(input: string): { address: string; chain: Chain } | null {
  const text = input.trim();

  // DexScreener URL: dexscreener.com/{chain}/{address}
  const dexMatch = text.match(/dexscreener\.com\/(\w+)\/([\w]+)/i);
  if (dexMatch) {
    return { address: dexMatch[2], chain: normalizeChain(dexMatch[1]) };
  }

  // Birdeye URL
  const birdMatch = text.match(/birdeye\.so\/token\/([\w]+)/i);
  if (birdMatch) {
    return { address: birdMatch[1], chain: 'solana' };
  }

  // Solscan
  const solscanMatch = text.match(/solscan\.io\/token\/([\w]+)/i);
  if (solscanMatch) {
    return { address: solscanMatch[1], chain: 'solana' };
  }

  // Etherscan / Basescan / BscScan
  const scanMatch = text.match(/(etherscan|basescan|bscscan)\.(?:io|com)\/token\/(0x[\da-f]+)/i);
  if (scanMatch) {
    const chainMap: Record<string, Chain> = { etherscan: 'ethereum', basescan: 'base', bscscan: 'bsc' };
    return { address: scanMatch[2], chain: chainMap[scanMatch[1].toLowerCase()] ?? 'ethereum' };
  }

  // Raw Solana address (base58, 32-44 chars)
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) {
    return { address: text, chain: 'solana' };
  }

  // Raw EVM address
  if (/^0x[0-9a-fA-F]{40}$/.test(text)) {
    return { address: text, chain: 'ethereum' };
  }

  return null;
}

function normalizeChain(raw: string): Chain {
  const lower = raw.toLowerCase();
  if (lower === 'solana' || lower === 'sol') return 'solana';
  if (lower === 'ethereum' || lower === 'eth') return 'ethereum';
  if (lower === 'base') return 'base';
  if (lower === 'bsc' || lower === 'bnb') return 'bsc';
  return 'solana';
}

/** The DexScreener pair fields PumpKit reads. Every field is optional on the wire. */
export interface DexPair {
  chainId?: string;
  tokenAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string | number;
  marketCap?: number;
  fdv?: number;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  pairCreatedAt?: number;
  info?: { imageUrl?: string };
}

const REQUEST_TIMEOUT_MS = 10_000;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) return null;
  return res.json() as Promise<unknown>;
}

function firstPair(list: unknown): DexPair | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  const pair: unknown = list[0];
  return typeof pair === 'object' && pair !== null ? (pair as DexPair) : null;
}

/** Fetch token data from DexScreener */
export async function fetchTokenInfo(address: string, chain?: Chain): Promise<TokenInfo | null> {
  try {
    const url = `${apiBase}/tokens/v1/${chain ?? 'solana'}/${encodeURIComponent(address)}`;
    log.debug(`Fetching token info: ${url}`);
    const pair = firstPair(await getJson(url));
    return pair ? mapPairToTokenInfo(pair) : fetchTokenBySearch(address);
  } catch (err) {
    log.error(`fetchTokenInfo error: ${err}`);
    return null;
  }
}

async function fetchTokenBySearch(query: string): Promise<TokenInfo | null> {
  try {
    const data = await getJson(`${apiBase}/latest/dex/search?q=${encodeURIComponent(query)}`);
    const pairs = typeof data === 'object' && data !== null ? (data as { pairs?: unknown }).pairs : null;
    const pair = firstPair(pairs);
    return pair ? mapPairToTokenInfo(pair) : null;
  } catch (err) {
    log.debug(`fetchTokenBySearch error: ${err}`);
    return null;
  }
}

export function mapPairToTokenInfo(pair: DexPair): TokenInfo {
  return {
    address: pair.baseToken?.address ?? pair.tokenAddress ?? '',
    chain: normalizeChain(pair.chainId ?? 'solana'),
    name: pair.baseToken?.name ?? 'Unknown',
    symbol: pair.baseToken?.symbol ?? '???',
    price: Number(pair.priceUsd ?? 0),
    mcap: Number(pair.marketCap ?? pair.fdv ?? 0),
    liquidity: Number(pair.liquidity?.usd ?? 0),
    volume24h: Number(pair.volume?.h24 ?? 0),
    pairAge: pair.pairCreatedAt ? Math.floor((Date.now() - pair.pairCreatedAt) / 1000) : null,
    imageUrl: pair.info?.imageUrl,
  };
}
