// ── Outsiders Bot — Database (SQLite) ──────────────────────────────

import Database from 'better-sqlite3';
import { log } from './logger.js';
import type {
  CallMode,
  CallType,
  Chain,
  DbCall,
  DbGroup,
  DbUser,
  DisplayMode,
  LeaderboardEntry,
  LeaderboardTimeframe,
} from './types.js';
import { calcPoints, calcRank } from './types.js';

let db: Database.Database;

// ── Init ───────────────────────────────────────────────────────────

export function initDb(dbPath: string): void {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate();
  log.info(`Database opened at ${dbPath}`);
}

function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id     INTEGER UNIQUE NOT NULL,
      username        TEXT,
      first_name      TEXT NOT NULL DEFAULT '',
      points          INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS groups (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id           INTEGER UNIQUE NOT NULL,
      title                 TEXT NOT NULL DEFAULT '',
      call_mode             TEXT NOT NULL DEFAULT 'button',
      display_mode          TEXT NOT NULL DEFAULT 'simple',
      hardcore_enabled      INTEGER NOT NULL DEFAULT 0,
      hardcore_min_wr       INTEGER NOT NULL DEFAULT 55,
      hardcore_min_calls    INTEGER NOT NULL DEFAULT 5,
      hardcore_round_start  TEXT,
      call_channel_id       INTEGER,
      call_channel_filter   TEXT NOT NULL DEFAULT 'everyone',
      created_at            TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS calls (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id        INTEGER NOT NULL REFERENCES groups(id),
      user_id         INTEGER NOT NULL REFERENCES users(id),
      token_address   TEXT NOT NULL,
      chain           TEXT NOT NULL DEFAULT 'solana',
      call_type       TEXT NOT NULL DEFAULT 'alpha',
      mcap_at_call    REAL NOT NULL DEFAULT 0,
      price_at_call   REAL NOT NULL DEFAULT 0,
      ath_mcap        REAL NOT NULL DEFAULT 0,
      ath_price       REAL NOT NULL DEFAULT 0,
      ath_at          TEXT,
      multiplier      REAL NOT NULL DEFAULT 1,
      points_awarded  INTEGER NOT NULL DEFAULT 0,
      finalized       INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS blocked_users (
      group_id    INTEGER NOT NULL REFERENCES groups(id),
      telegram_id INTEGER NOT NULL,
      blocked_at  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (group_id, telegram_id)
    );

    CREATE INDEX IF NOT EXISTS idx_calls_group   ON calls(group_id);
    CREATE INDEX IF NOT EXISTS idx_calls_user    ON calls(user_id);
    CREATE INDEX IF NOT EXISTS idx_calls_active  ON calls(finalized);
    CREATE INDEX IF NOT EXISTS idx_calls_created ON calls(created_at);
  `);
}

// ── Users ──────────────────────────────────────────────────────────

export function upsertUser(telegramId: number, username: string | null, firstName: string): DbUser {
  db.prepare(`
    INSERT INTO users (telegram_id, username, first_name)
    VALUES (?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET username = excluded.username, first_name = excluded.first_name
  `).run(telegramId, username, firstName);

  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as DbUser;
}

export function getUser(telegramId: number): DbUser | undefined {
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as DbUser | undefined;
}

// ── Groups ─────────────────────────────────────────────────────────

export function upsertGroup(telegramId: number, title: string): DbGroup {
  db.prepare(`
    INSERT INTO groups (telegram_id, title)
    VALUES (?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET title = excluded.title
  `).run(telegramId, title);

  return db.prepare('SELECT * FROM groups WHERE telegram_id = ?').get(telegramId) as DbGroup;
}

export function getGroup(telegramId: number): DbGroup | undefined {
  return db.prepare('SELECT * FROM groups WHERE telegram_id = ?').get(telegramId) as DbGroup | undefined;
}

export function updateGroupSettings(
  groupTgId: number,
  settings: Partial<Pick<DbGroup, 'call_mode' | 'display_mode' | 'hardcore_enabled' | 'hardcore_min_wr' | 'hardcore_min_calls' | 'call_channel_id' | 'call_channel_filter'>>,
): void {
  const fields = Object.entries(settings)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => `${k} = @${k}`);
  if (fields.length === 0) return;

  const sql = `UPDATE groups SET ${fields.join(', ')} WHERE telegram_id = @telegram_id`;
  db.prepare(sql).run({ ...settings, telegram_id: groupTgId });
}

// ── Calls ──────────────────────────────────────────────────────────

export function createCall(
  groupTgId: number,
  userTgId: number,
  tokenAddress: string,
  chain: Chain,
  callType: CallType,
  mcap: number,
  price: number,
): DbCall {
  const group = getGroup(groupTgId);
  const user = getUser(userTgId);
  if (!group || !user) throw new Error('Group or user not found');

  db.prepare(`
    INSERT INTO calls (group_id, user_id, token_address, chain, call_type, mcap_at_call, price_at_call, ath_mcap, ath_price, multiplier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(group.id, user.id, tokenAddress, chain, callType, mcap, price, mcap, price);

  const call = db.prepare('SELECT * FROM calls WHERE rowid = last_insert_rowid()').get() as DbCall;
  return call;
}

export function updateCallAth(callId: number, mcap: number, price: number): void {
  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as DbCall | undefined;
  if (!call || call.finalized) return;

  if (mcap > call.ath_mcap) {
    const multiplier = call.mcap_at_call > 0 ? mcap / call.mcap_at_call : 1;
    const points = calcPoints(multiplier);

    db.prepare(`
      UPDATE calls SET ath_mcap = ?, ath_price = ?, multiplier = ?, points_awarded = ?, ath_at = datetime('now')
      WHERE id = ?
    `).run(mcap, price, multiplier, points, callId);

    // Update user points delta
    const oldPoints = call.points_awarded;
    if (points !== oldPoints) {
      db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(points - oldPoints, call.user_id);
    }
  }
}

export function finalizeCall(callId: number): void {
  db.prepare('UPDATE calls SET finalized = 1 WHERE id = ?').run(callId);
}

export function getActiveCalls(): DbCall[] {
  return db.prepare('SELECT * FROM calls WHERE finalized = 0').all() as DbCall[];
}

export function getCallsByUser(userTgId: number, groupTgId: number, limit = 20): DbCall[] {
  return db.prepare(`
    SELECT c.* FROM calls c
    JOIN users u ON c.user_id = u.id
    JOIN groups g ON c.group_id = g.id
    WHERE u.telegram_id = ? AND g.telegram_id = ?
    ORDER BY c.created_at DESC
    LIMIT ?
  `).all(userTgId, groupTgId, limit) as DbCall[];
}

export function getCallByToken(tokenAddress: string, groupTgId: number): DbCall | undefined {
  return db.prepare(`
    SELECT c.* FROM calls c
    JOIN groups g ON c.group_id = g.id
    WHERE c.token_address = ? AND g.telegram_id = ?
    ORDER BY c.created_at DESC
    LIMIT 1
  `).get(tokenAddress, groupTgId) as DbCall | undefined;
}

export function getLastCalls(groupTgId: number, limit: number): (DbCall & { username: string; first_name: string })[] {
  return db.prepare(`
    SELECT c.*, u.username, u.first_name FROM calls c
    JOIN groups g ON c.group_id = g.id
    JOIN users u ON c.user_id = u.id
    WHERE g.telegram_id = ?
    ORDER BY c.created_at DESC
    LIMIT ?
  `).all(groupTgId, limit) as (DbCall & { username: string; first_name: string })[];
}

// ── Leaderboards ───────────────────────────────────────────────────

function timeframeClause(tf: LeaderboardTimeframe): string {
  switch (tf) {
    case '24h': return "AND c.created_at >= datetime('now', '-1 day')";
    case '7d':  return "AND c.created_at >= datetime('now', '-7 days')";
    case '30d': return "AND c.created_at >= datetime('now', '-30 days')";
    case 'all': return '';
  }
}

export function getCallsLeaderboard(groupTgId: number, tf: LeaderboardTimeframe, limit = 10): LeaderboardEntry[] {
  const rows = db.prepare(`
    SELECT
      u.telegram_id,
      u.username,
      c.multiplier AS value,
      c.token_address
    FROM calls c
    JOIN groups g ON c.group_id = g.id
    JOIN users u ON c.user_id = u.id
    WHERE g.telegram_id = ? ${timeframeClause(tf)}
    ORDER BY c.multiplier DESC
    LIMIT ?
  `).all(groupTgId, limit) as { telegram_id: number; username: string; value: number }[];

  return rows.map((r, i) => ({
    rank: i + 1,
    username: r.username ?? 'Unknown',
    telegramId: r.telegram_id,
    value: r.value,
    callCount: 0,
    winRate: 0,
    avgGain: 0,
  }));
}

export function getPerformanceLeaderboard(groupTgId: number, tf: LeaderboardTimeframe, limit = 10): LeaderboardEntry[] {
  const rows = db.prepare(`
    SELECT
      u.telegram_id,
      u.username,
      SUM(c.points_awarded) AS value,
      COUNT(*) AS call_count,
      AVG(c.multiplier) AS avg_gain,
      ROUND(100.0 * SUM(CASE WHEN c.multiplier >= 2 THEN 1 ELSE 0 END) / COUNT(*), 1) AS win_rate
    FROM calls c
    JOIN groups g ON c.group_id = g.id
    JOIN users u ON c.user_id = u.id
    WHERE g.telegram_id = ? ${timeframeClause(tf)}
    GROUP BY u.id
    ORDER BY value DESC
    LIMIT ?
  `).all(groupTgId, limit) as { telegram_id: number; username: string; value: number; call_count: number; avg_gain: number; win_rate: number }[];

  return rows.map((r, i) => ({
    rank: i + 1,
    username: r.username ?? 'Unknown',
    telegramId: r.telegram_id,
    value: r.value,
    callCount: r.call_count,
    winRate: r.win_rate,
    avgGain: r.avg_gain,
  }));
}

// ── User Stats ─────────────────────────────────────────────────────

export interface UserStats {
  totalCalls: number;
  wins: number;
  winRate: number;
  avgGain: number;
  totalPoints: number;
  bestMultiplier: number;
  rank: ReturnType<typeof calcRank>;
}

export function getUserStats(userTgId: number, groupTgId?: number): UserStats {
  const groupClause = groupTgId ? 'AND g.telegram_id = ?' : '';
  const params = groupTgId ? [userTgId, groupTgId] : [userTgId];

  const row = db.prepare(`
    SELECT
      COUNT(*) AS total_calls,
      SUM(CASE WHEN c.multiplier >= 2 THEN 1 ELSE 0 END) AS wins,
      AVG(c.multiplier) AS avg_gain,
      SUM(c.points_awarded) AS total_points,
      MAX(c.multiplier) AS best_multiplier
    FROM calls c
    JOIN users u ON c.user_id = u.id
    ${groupTgId ? 'JOIN groups g ON c.group_id = g.id' : ''}
    WHERE u.telegram_id = ? ${groupClause}
  `).get(...params) as { total_calls: number; wins: number; avg_gain: number; total_points: number; best_multiplier: number };

  const winRate = row.total_calls > 0 ? (row.wins / row.total_calls) * 100 : 0;
  return {
    totalCalls: row.total_calls,
    wins: row.wins ?? 0,
    winRate: Math.round(winRate * 10) / 10,
    avgGain: Math.round((row.avg_gain ?? 1) * 100) / 100,
    totalPoints: row.total_points ?? 0,
    bestMultiplier: row.best_multiplier ?? 0,
    rank: calcRank(winRate),
  };
}

// ── Blocked Users ──────────────────────────────────────────────────

export function blockUser(groupTgId: number, userTgId: number): void {
  const group = getGroup(groupTgId);
  if (!group) return;
  db.prepare(`
    INSERT OR IGNORE INTO blocked_users (group_id, telegram_id) VALUES (?, ?)
  `).run(group.id, userTgId);
}

export function unblockUser(groupTgId: number, userTgId: number): void {
  const group = getGroup(groupTgId);
  if (!group) return;
  db.prepare('DELETE FROM blocked_users WHERE group_id = ? AND telegram_id = ?').run(group.id, userTgId);
}

export function isBlocked(groupTgId: number, userTgId: number): boolean {
  const group = getGroup(groupTgId);
  if (!group) return false;
  const row = db.prepare('SELECT 1 FROM blocked_users WHERE group_id = ? AND telegram_id = ?').get(group.id, userTgId);
  return !!row;
}

// ── Hardcore Mode ──────────────────────────────────────────────────

export function startHardcoreRound(groupTgId: number): void {
  db.prepare(`UPDATE groups SET hardcore_round_start = datetime('now') WHERE telegram_id = ?`).run(groupTgId);
}

export interface HardcoreStatus {
  username: string;
  telegramId: number;
  calls: number;
  winRate: number;
  atRisk: boolean;
}

export function getHardcoreStatus(groupTgId: number): HardcoreStatus[] {
  const group = getGroup(groupTgId);
  if (!group || !group.hardcore_round_start) return [];

  return db.prepare(`
    SELECT
      u.telegram_id,
      u.username,
      COUNT(*) AS calls,
      ROUND(100.0 * SUM(CASE WHEN c.multiplier >= 2 THEN 1 ELSE 0 END) / COUNT(*), 1) AS win_rate
    FROM calls c
    JOIN users u ON c.user_id = u.id
    WHERE c.group_id = ? AND c.created_at >= ?
    GROUP BY u.id
    HAVING calls >= ?
  `).all(group.id, group.hardcore_round_start, group.hardcore_min_calls)
    .map((r: any) => ({
      username: r.username ?? 'Unknown',
      telegramId: r.telegram_id,
      calls: r.calls,
      winRate: r.win_rate,
      atRisk: r.win_rate < group.hardcore_min_wr,
    }));
}

// ── Wipe ───────────────────────────────────────────────────────────

export function wipeLeaderboard(groupTgId: number): number {
  const group = getGroup(groupTgId);
  if (!group) return 0;
  const result = db.prepare('DELETE FROM calls WHERE group_id = ?').run(group.id);
  return result.changes;
}

export function closeDb(): void {
  db?.close();
}
