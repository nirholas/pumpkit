// ── Outsiders Bot — Token Price Service (DexScreener) ──────────────

import { log } from './logger.js';
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

/** Fetch token data from DexScreener */
export async function fetchTokenInfo(address: string, chain?: Chain): Promise<TokenInfo | null> {
  try {
    const url = `${apiBase}/tokens/v1/${chain ?? 'solana'}/${encodeURIComponent(address)}`;
    log.debug(`Fetching token info: ${url}`);
    const res = await fetch(url);

    if (!res.ok) {
      // Fallback: search endpoint
      return fetchTokenBySearch(address);
    }

    const data = await res.json() as any[];
    if (!data || data.length === 0) return fetchTokenBySearch(address);

    const pair = data[0];
    return mapPairToTokenInfo(pair);
  } catch (err) {
    log.error(`fetchTokenInfo error: ${err}`);
    return null;
  }
}

async function fetchTokenBySearch(query: string): Promise<TokenInfo | null> {
  try {
    const url = `${apiBase}/latest/dex/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as { pairs?: any[] };
    if (!data.pairs || data.pairs.length === 0) return null;

    return mapPairToTokenInfo(data.pairs[0]);
  } catch {
    return null;
  }
}

function mapPairToTokenInfo(pair: any): TokenInfo {
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
