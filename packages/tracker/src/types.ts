// ── Outsiders Bot — Types ──────────────────────────────────────────

/** Call type: alpha (high conviction) or gamble (speculative) */
export type CallType = 'alpha' | 'gamble';

/** Call mode for the group */
export type CallMode = 'auto' | 'button';

/** Display mode for call prompts */
export type DisplayMode = 'simple' | 'advanced';

/** User rank tiers based on win rate */
export type RankTier = 'Amateur' | 'Novice' | 'Contender' | 'Guru' | 'Oracle';

/** Blockchain networks supported */
export type Chain = 'solana' | 'ethereum' | 'base' | 'bsc';

// ── Database Row Types ─────────────────────────────────────────────

export interface DbUser {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string;
  points: number;
  created_at: string;
}

export interface DbGroup {
  id: number;
  telegram_id: number;
  title: string;
  call_mode: CallMode;
  display_mode: DisplayMode;
  hardcore_enabled: boolean;
  hardcore_min_wr: number;       // percentage, default 55
  hardcore_min_calls: number;    // default 5
  hardcore_round_start: string | null;
  call_channel_id: number | null;
  call_channel_filter: 'owner' | 'admins' | 'everyone';
  created_at: string;
}

export interface DbCall {
  id: number;
  group_id: number;
  user_id: number;
  token_address: string;
  chain: Chain;
  call_type: CallType;
  mcap_at_call: number;         // market cap in USD at time of call
  price_at_call: number;        // token price in USD at time of call
  ath_mcap: number;             // highest market cap seen after call
  ath_price: number;            // highest price seen after call
  ath_at: string | null;        // timestamp of ATH
  multiplier: number;           // ath_mcap / mcap_at_call
  points_awarded: number;
  finalized: boolean;           // true once ATH tracking stops
  created_at: string;
}

export interface DbBlockedUser {
  group_id: number;
  telegram_id: number;
  blocked_at: string;
}

// ── Token Data ─────────────────────────────────────────────────────

export interface TokenInfo {
  address: string;
  chain: Chain;
  name: string;
  symbol: string;
  price: number;
  mcap: number;
  liquidity: number;
  volume24h: number;
  pairAge: number | null;       // seconds since pair created
  topHolders?: { address: string; pct: number }[];
  imageUrl?: string;
}

// ── Leaderboard ────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  username: string;
  telegramId: number;
  value: number;                // points or multiplier depending on board type
  callCount: number;
  winRate: number;
  avgGain: number;
}

export type LeaderboardType = 'calls' | 'performance';
export type LeaderboardTimeframe = '24h' | '7d' | '30d' | 'all';

// ── PNL Card Data ──────────────────────────────────────────────────

export interface PnlCardData {
  tokenName: string;
  tokenSymbol: string;
  callerName: string;
  mcapAtCall: number;
  athMcap: number;
  multiplier: number;
  callDate: string;
  chain: Chain;
  rank: RankTier;
}

// ── Config ─────────────────────────────────────────────────────────

export interface BotConfig {
  telegramBotToken: string;
  callChannelId: number | null;
  dexscreenerApi: string;
  athPollInterval: number;      // seconds
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  dbPath: string;
}

// ── Scoring ────────────────────────────────────────────────────────

export function calcPoints(multiplier: number): number {
  if (multiplier >= 30) return 5;
  if (multiplier >= 15) return 4;
  if (multiplier >= 5) return 3;
  if (multiplier >= 2) return 2;
  if (multiplier >= 1.5) return 0;
  return -1;
}

export function calcRank(winRate: number): RankTier {
  if (winRate >= 70) return 'Oracle';
  if (winRate >= 60) return 'Guru';
  if (winRate >= 50) return 'Contender';
  if (winRate >= 40) return 'Novice';
  return 'Amateur';
}
