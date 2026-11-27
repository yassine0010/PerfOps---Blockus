import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import Database from 'better-sqlite3';
import { sanitizeDisplayText } from '../../shared/board.ts';

const scryptAsync = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number
) => Promise<Buffer>;

const MAX_PASSWORD_LENGTH = 128;

// ─── Types ───────────────────────────────────────────────────

export interface UserStats {
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  totalSquaresPlaced: number;
  bestScore: number | null; // lowest net score remaining (null = never finished a game)
  winStreak: number;
  currentStreak: number;
}

export interface StoredUser {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  avatarSeed: string;
  createdAt: number;
  stats: UserStats;
}

export type PublicUser = Omit<StoredUser, 'passwordHash'>;
export type PublicProfileUser = Omit<PublicUser, 'username'>;

export interface GameRecordPlayer {
  userId: string;
  playerName: string;
  color: string;
  squaresRemaining: number;
  rank: number;
  forfeited: boolean;
}

export interface GameRecord {
  id: string;
  roomId: string;
  players: GameRecordPlayer[];
  playedAt: number;
}

// ─── Database Setup ──────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'blokus.db');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema Migration ───────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    username        TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    avatar_seed     TEXT NOT NULL,
    created_at      INTEGER NOT NULL,
    games_played    INTEGER NOT NULL DEFAULT 0,
    games_won       INTEGER NOT NULL DEFAULT 0,
    games_lost      INTEGER NOT NULL DEFAULT 0,
    total_squares_placed INTEGER NOT NULL DEFAULT 0,
    best_score      INTEGER NOT NULL DEFAULT -1,
    win_streak      INTEGER NOT NULL DEFAULT 0,
    current_streak  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS auth_tokens (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS game_records (
    id        TEXT PRIMARY KEY,
    room_id   TEXT NOT NULL,
    played_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS game_record_players (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id           TEXT NOT NULL REFERENCES game_records(id) ON DELETE CASCADE,
    user_id           TEXT,
    player_name       TEXT NOT NULL,
    color             TEXT NOT NULL,
    squares_remaining INTEGER NOT NULL,
    rank              INTEGER NOT NULL,
    forfeited         INTEGER NOT NULL DEFAULT 0
  );

  DROP INDEX IF EXISTS idx_tokens_user;
  CREATE INDEX IF NOT EXISTS idx_tokens_expires     ON auth_tokens(expires_at);
  CREATE INDEX IF NOT EXISTS idx_users_leaderboard  ON users(games_won DESC, games_played DESC);
  CREATE INDEX IF NOT EXISTS idx_grp_game           ON game_record_players(game_id);
  CREATE INDEX IF NOT EXISTS idx_grp_user           ON game_record_players(user_id);
  CREATE INDEX IF NOT EXISTS idx_game_played        ON game_records(played_at);
`);

// Non-destructive column migration for existing SQLite databases
const authTokenColumns = db.prepare(`PRAGMA table_info(auth_tokens)`).all() as { name: string }[];
if (!authTokenColumns.some(c => c.name === 'expires_at')) {
  db.exec(`ALTER TABLE auth_tokens ADD COLUMN expires_at INTEGER`);
}

console.log(`[UserStore] SQLite database ready at ${DB_PATH}`);

// ─── Prepared Statements ─────────────────────────────────────

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const PUBLIC_USER_COLUMNS = `
  id, display_name, avatar_seed, created_at,
  games_played, games_won, games_lost, total_squares_placed,
  best_score, win_streak, current_streak
`;

const FULL_USER_COLUMNS = `
  id, username, password_hash, display_name, avatar_seed, created_at,
  games_played, games_won, games_lost, total_squares_placed,
  best_score, win_streak, current_streak
`;

const stmts = {
  insertUser: db.prepare(`
    INSERT INTO users (id, username, password_hash, display_name, avatar_seed, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  getUserByUsername: db.prepare(`SELECT ${FULL_USER_COLUMNS} FROM users WHERE username = ?`),
  getUserById: db.prepare(`SELECT ${FULL_USER_COLUMNS} FROM users WHERE id = ?`),
  getPublicProfileById: db.prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`),
  updatePasswordHash: db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`),
  insertToken: db.prepare(`INSERT INTO auth_tokens (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`),
  deleteToken: db.prepare(`DELETE FROM auth_tokens WHERE token = ?`),
  deleteExpiredTokens: db.prepare(`DELETE FROM auth_tokens WHERE expires_at IS NOT NULL AND expires_at < ?`),
  getTokenInfo: db.prepare(`SELECT user_id, expires_at FROM auth_tokens WHERE token = ?`),
  updateStats: db.prepare(`
    UPDATE users SET
      games_played = ?, games_won = ?, games_lost = ?,
      total_squares_placed = ?, best_score = ?,
      win_streak = ?, current_streak = ?
    WHERE id = ?
  `),
  getLeaderboard: db.prepare(`
    SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE games_played > 0
    ORDER BY games_won DESC,
      CASE WHEN games_played > 0 THEN CAST(games_won AS REAL) / games_played ELSE 0 END DESC,
      games_played DESC
    LIMIT ?
  `),
  insertGameRecord: db.prepare(`INSERT INTO game_records (id, room_id, played_at) VALUES (?, ?, ?)`),
  insertGamePlayer: db.prepare(`
    INSERT INTO game_record_players (game_id, user_id, player_name, color, squares_remaining, rank, forfeited)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  getPlayerGames: db.prepare(`
    SELECT DISTINCT gr.id, gr.room_id, gr.played_at FROM game_records gr
    INNER JOIN game_record_players grp ON grp.game_id = gr.id
    WHERE grp.user_id = ?
    ORDER BY gr.played_at DESC
    LIMIT ?
  `),
};

// Periodically prune expired auth tokens
stmts.deleteExpiredTokens.run(Date.now());
const tokenSweepTimer = setInterval(() => {
  stmts.deleteExpiredTokens.run(Date.now());
}, 60 * 60 * 1000);
if (tokenSweepTimer.unref) tokenSweepTimer.unref();

// ─── Helpers ─────────────────────────────────────────────────

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, 64);
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  if (storedHash.startsWith('scrypt:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return { valid: false, needsUpgrade: false };
    const [, salt, hex] = parts;
    const derived = await scryptAsync(password, salt, 64);
    const expected = Buffer.from(hex, 'hex');
    if (derived.length !== expected.length) return { valid: false, needsUpgrade: false };
    return { valid: crypto.timingSafeEqual(derived, expected), needsUpgrade: false };
  }
  // Backward-compatible verification for legacy SHA-256 hashes (upgraded on login)
  const legacyHash = crypto.createHash('sha256').update(password + '_blokus_salt').digest('hex');
  const matches = legacyHash === storedHash;
  return { valid: matches, needsUpgrade: matches };
}

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function rowToPublicProfileUser(row: any): PublicProfileUser {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarSeed: row.avatar_seed,
    createdAt: row.created_at,
    stats: {
      gamesPlayed: row.games_played,
      gamesWon: row.games_won,
      gamesLost: row.games_lost,
      totalSquaresPlaced: row.total_squares_placed,
      bestScore: row.games_played === 0 || row.best_score === -1 ? null : row.best_score,
      winStreak: row.win_streak,
      currentStreak: row.current_streak,
    }
  };
}

function rowToUser(row: any): StoredUser {
  return {
    username: row.username,
    passwordHash: row.password_hash,
    ...rowToPublicProfileUser(row),
  };
}

function sanitizeUser(user: StoredUser): PublicUser {
  const { passwordHash, ...safe } = user;
  return safe;
}

export interface AuthResult {
  success: boolean;
  error?: string;
  statusCode?: number;
  token?: string;
  user?: PublicUser;
}

// ─── Store (public API) ──────────────────────────────────────

class UserStore {

  // ── Auth ──

  public async register(
    username: string,
    password: string,
    displayName?: string
  ): Promise<AuthResult> {
    if (typeof username !== 'string' || typeof password !== 'string') {
      return { success: false, statusCode: 400, error: 'Username and password must be strings' };
    }

    const normalized = username.toLowerCase().trim();

    if (normalized.length < 3 || normalized.length > 20) {
      return { success: false, statusCode: 400, error: 'Username must be 3–20 characters' };
    }
    if (!/^[a-z0-9_]+$/.test(normalized)) {
      return { success: false, statusCode: 400, error: 'Username may only contain letters, numbers, and underscores' };
    }
    if (password.length < 4 || password.length > MAX_PASSWORD_LENGTH) {
      return { success: false, statusCode: 400, error: `Password must be 4–${MAX_PASSWORD_LENGTH} characters` };
    }

    const existing = stmts.getUserByUsername.get(normalized);
    if (existing) {
      return { success: false, statusCode: 409, error: 'Username already taken' };
    }

    const userId = generateId('u');
    const now = Date.now();
    const cleanDisplay = sanitizeDisplayText(displayName, 15, normalized);
    const passwordHash = await hashPassword(password);

    try {
      stmts.insertUser.run(
        userId,
        normalized,
        passwordHash,
        cleanDisplay,
        cleanDisplay,
        now
      );
    } catch (err: any) {
      if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE' || String(err?.message).includes('UNIQUE constraint failed')) {
        return { success: false, statusCode: 409, error: 'Username already taken' };
      }
      throw err;
    }

    const token = this.createToken(userId);
    const user = rowToUser(stmts.getUserById.get(userId));

    console.log(`[UserStore] Registered: ${normalized} (${userId})`);
    return { success: true, token, user: sanitizeUser(user) };
  }

  public async login(
    username: string,
    password: string
  ): Promise<AuthResult> {
    if (typeof username !== 'string' || typeof password !== 'string') {
      return { success: false, statusCode: 400, error: 'Username and password must be strings' };
    }
    if (password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
      return { success: false, statusCode: 401, error: 'Invalid username or password' };
    }

    const normalized = username.toLowerCase().trim();
    const row = stmts.getUserByUsername.get(normalized) as any;

    if (!row) {
      return { success: false, statusCode: 401, error: 'Invalid username or password' };
    }

    const check = await verifyPassword(password, row.password_hash);
    if (!check.valid) {
      return { success: false, statusCode: 401, error: 'Invalid username or password' };
    }

    if (check.needsUpgrade) {
      stmts.updatePasswordHash.run(await hashPassword(password), row.id);
    }

    const token = this.createToken(row.id);
    const user = rowToUser(row);

    console.log(`[UserStore] Login: ${normalized}`);
    return { success: true, token, user: sanitizeUser(user) };
  }

  public logout(token: string): void {
    stmts.deleteToken.run(token);
  }

  // ── Token Lookup ──

  public getUserByToken(token: string): PublicUser | null {
    const userId = this.getUserIdByToken(token);
    if (!userId) return null;
    const userRow = stmts.getUserById.get(userId) as any;
    if (!userRow) return null;
    return sanitizeUser(rowToUser(userRow));
  }

  public getUserIdByToken(token: string): string | null {
    if (typeof token !== 'string' || !token) return null;
    const row = stmts.getTokenInfo.get(token) as { user_id: string; expires_at: number | null } | undefined;
    if (!row) return null;
    if (row.expires_at !== null && row.expires_at < Date.now()) {
      stmts.deleteToken.run(token);
      return null;
    }
    return row.user_id;
  }

  // ── Profile ──

  public getProfile(userId: string): { user: PublicProfileUser; recentGames: GameRecord[] } | null {
    const row = stmts.getPublicProfileById.get(userId) as any;
    if (!row) return null;

    const user = rowToPublicProfileUser(row);
    const gameRows = stmts.getPlayerGames.all(userId, 10) as any[];
    if (gameRows.length === 0) {
      return { user, recentGames: [] };
    }

    // Batch fetch all participants across recent games (eliminates N+1 queries)
    const placeholders = gameRows.map(() => '?').join(',');
    const playerRows = db
      .prepare(`SELECT game_id, user_id, player_name, color, squares_remaining, rank, forfeited FROM game_record_players WHERE game_id IN (${placeholders}) ORDER BY rank ASC, id ASC`)
      .all(...gameRows.map(g => g.id)) as any[];

    const playersByGame = new Map<string, GameRecordPlayer[]>();
    for (const p of playerRows) {
      let list = playersByGame.get(p.game_id);
      if (!list) {
        list = [];
        playersByGame.set(p.game_id, list);
      }
      list.push({
        userId: p.user_id || '',
        playerName: p.player_name,
        color: p.color,
        squaresRemaining: p.squares_remaining,
        rank: p.rank,
        forfeited: !!p.forfeited
      });
    }

    const recentGames: GameRecord[] = gameRows.map(gr => ({
      id: gr.id,
      roomId: gr.room_id,
      playedAt: gr.played_at,
      players: playersByGame.get(gr.id) || []
    }));

    return { user, recentGames };
  }

  // ── Leaderboard ──

  public getLeaderboard(limit: number = 25): (PublicProfileUser & { winRate: number })[] {
    const rows = stmts.getLeaderboard.all(limit) as any[];
    return rows.map(row => {
      const user = rowToPublicProfileUser(row);
      const winRate = user.stats.gamesPlayed > 0
        ? Math.round((user.stats.gamesWon / user.stats.gamesPlayed) * 100)
        : 0;
      return { ...user, winRate };
    });
  }

  // ── Game Recording ──

  public recordGame(
    roomId: string,
    results: {
      userId?: string;
      playerName: string;
      color: string;
      squaresRemaining: number;
      squaresPlaced?: number;
      bonus?: number;
      netScore?: number;
      is2P?: boolean;
      rank: number;
      forfeited: boolean;
    }[]
  ): void {
    const gameId = generateId('g');
    const now = Date.now();

    const recordGameTx = db.transaction(() => {
      stmts.insertGameRecord.run(gameId, roomId, now);
      const updatedUserIds = new Set<string>();

      for (const r of results) {
        stmts.insertGamePlayer.run(
          gameId,
          r.userId || null,
          r.playerName,
          r.color,
          r.forfeited ? 999 : r.squaresRemaining,
          r.rank,
          r.forfeited ? 1 : 0
        );

        // Update user stats if authenticated (at most once per userId per match)
        if (!r.userId || updatedUserIds.has(r.userId)) continue;
        updatedUserIds.add(r.userId);

        const userRow = stmts.getUserById.get(r.userId) as any;
        if (!userRow) continue;

        const isWinner = r.rank === 1 && !r.forfeited;
        const gamesPlayed = userRow.games_played + 1;
        const gamesWon = userRow.games_won + (isWinner ? 1 : 0);
        const gamesLost = userRow.games_lost + (isWinner ? 0 : 1);
        const squaresPlaced = typeof r.squaresPlaced === 'number'
          ? Math.max(0, r.squaresPlaced)
          : Math.max(0, (r.is2P ? 178 : 89) - r.squaresRemaining);
        const totalSquaresPlaced = userRow.total_squares_placed + squaresPlaced;

        let bestScore = userRow.best_score;
        if (!r.forfeited) {
          const comparableScore = r.is2P
            ? Math.round(r.squaresRemaining / 2) - (r.bonus || 0)
            : (typeof r.netScore === 'number' ? r.netScore : r.squaresRemaining - (r.bonus || 0));
          if (userRow.games_played === 0 || bestScore === -1 || comparableScore < bestScore) {
            bestScore = comparableScore;
          }
        }

        let currentStreak = isWinner ? userRow.current_streak + 1 : 0;
        let winStreak = Math.max(userRow.win_streak, currentStreak);

        stmts.updateStats.run(
          gamesPlayed, gamesWon, gamesLost,
          totalSquaresPlaced, bestScore,
          winStreak, currentStreak,
          r.userId
        );
      }
    });

    recordGameTx();
    console.log(`[UserStore] Game recorded: ${gameId} — ${results.length} players`);
  }

  // ── Private ──

  private createToken(userId: string): string {
    const now = Date.now();
    const token = `auth_${crypto.randomBytes(24).toString('hex')}`;
    stmts.insertToken.run(token, userId, now, now + TOKEN_TTL_MS);
    return token;
  }
}

export const userStore = new UserStore();
