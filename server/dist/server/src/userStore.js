import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
// ─── Database Setup ──────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'blokus.db');
// Ensure data directory exists
import fs from 'fs';
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
    created_at INTEGER NOT NULL
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

  CREATE INDEX IF NOT EXISTS idx_tokens_user     ON auth_tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_grp_game        ON game_record_players(game_id);
  CREATE INDEX IF NOT EXISTS idx_grp_user        ON game_record_players(user_id);
  CREATE INDEX IF NOT EXISTS idx_game_played     ON game_records(played_at);
`);
console.log(`[UserStore] SQLite database ready at ${DB_PATH}`);
// ─── Prepared Statements ─────────────────────────────────────
const stmts = {
    insertUser: db.prepare(`
    INSERT INTO users (id, username, password_hash, display_name, avatar_seed, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
    getUserByUsername: db.prepare(`SELECT * FROM users WHERE username = ?`),
    getUserById: db.prepare(`SELECT * FROM users WHERE id = ?`),
    insertToken: db.prepare(`INSERT INTO auth_tokens (token, user_id, created_at) VALUES (?, ?, ?)`),
    deleteToken: db.prepare(`DELETE FROM auth_tokens WHERE token = ?`),
    getUserIdByToken: db.prepare(`SELECT user_id FROM auth_tokens WHERE token = ?`),
    updateStats: db.prepare(`
    UPDATE users SET
      games_played = ?, games_won = ?, games_lost = ?,
      total_squares_placed = ?, best_score = ?,
      win_streak = ?, current_streak = ?
    WHERE id = ?
  `),
    getLeaderboard: db.prepare(`
    SELECT * FROM users WHERE games_played > 0
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
    SELECT gr.* FROM game_records gr
    INNER JOIN game_record_players grp ON grp.game_id = gr.id
    WHERE grp.user_id = ?
    ORDER BY gr.played_at DESC
    LIMIT ?
  `),
    getGamePlayers: db.prepare(`SELECT * FROM game_record_players WHERE game_id = ?`),
};
// ─── Helpers ─────────────────────────────────────────────────
function hashPassword(password) {
    return crypto.createHash('sha256').update(password + '_blokus_salt').digest('hex');
}
function generateId(prefix) {
    return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}
function rowToUser(row) {
    return {
        id: row.id,
        username: row.username,
        passwordHash: row.password_hash,
        displayName: row.display_name,
        avatarSeed: row.avatar_seed,
        createdAt: row.created_at,
        stats: {
            gamesPlayed: row.games_played,
            gamesWon: row.games_won,
            gamesLost: row.games_lost,
            totalSquaresPlaced: row.total_squares_placed,
            bestScore: row.best_score,
            winStreak: row.win_streak,
            currentStreak: row.current_streak,
        }
    };
}
function sanitizeUser(user) {
    const { passwordHash, ...safe } = user;
    return safe;
}
// ─── Store (public API) ──────────────────────────────────────
class UserStore {
    // ── Auth ──
    register(username, password, displayName) {
        const normalized = username.toLowerCase().trim();
        if (normalized.length < 3 || normalized.length > 20) {
            return { success: false, error: 'Username must be 3–20 characters' };
        }
        if (!/^[a-z0-9_]+$/.test(normalized)) {
            return { success: false, error: 'Username may only contain letters, numbers, and underscores' };
        }
        if (password.length < 4) {
            return { success: false, error: 'Password must be at least 4 characters' };
        }
        const existing = stmts.getUserByUsername.get(normalized);
        if (existing) {
            return { success: false, error: 'Username already taken' };
        }
        const userId = generateId('u');
        const now = Date.now();
        stmts.insertUser.run(userId, normalized, hashPassword(password), (displayName || username).trim().substring(0, 15), username, now);
        const token = this.createToken(userId);
        const user = rowToUser(stmts.getUserById.get(userId));
        console.log(`[UserStore] Registered: ${normalized} (${userId})`);
        return { success: true, token, user: sanitizeUser(user) };
    }
    login(username, password) {
        const normalized = username.toLowerCase().trim();
        const row = stmts.getUserByUsername.get(normalized);
        if (!row || row.password_hash !== hashPassword(password)) {
            return { success: false, error: 'Invalid username or password' };
        }
        const token = this.createToken(row.id);
        const user = rowToUser(row);
        console.log(`[UserStore] Login: ${normalized}`);
        return { success: true, token, user: sanitizeUser(user) };
    }
    logout(token) {
        stmts.deleteToken.run(token);
    }
    // ── Token Lookup ──
    getUserByToken(token) {
        const tokenRow = stmts.getUserIdByToken.get(token);
        if (!tokenRow)
            return null;
        const userRow = stmts.getUserById.get(tokenRow.user_id);
        if (!userRow)
            return null;
        return sanitizeUser(rowToUser(userRow));
    }
    getUserIdByToken(token) {
        const row = stmts.getUserIdByToken.get(token);
        return row ? row.user_id : null;
    }
    // ── Profile ──
    getUserById(userId) {
        const row = stmts.getUserById.get(userId);
        return row ? sanitizeUser(rowToUser(row)) : null;
    }
    getProfile(userId) {
        const row = stmts.getUserById.get(userId);
        if (!row)
            return null;
        const gameRows = stmts.getPlayerGames.all(userId, 10);
        const recentGames = gameRows.map(gr => {
            const players = stmts.getGamePlayers.all(gr.id).map(p => ({
                userId: p.user_id || '',
                playerName: p.player_name,
                color: p.color,
                squaresRemaining: p.squares_remaining,
                rank: p.rank,
                forfeited: !!p.forfeited
            }));
            return {
                id: gr.id,
                roomId: gr.room_id,
                playedAt: gr.played_at,
                players
            };
        });
        return { user: sanitizeUser(rowToUser(row)), recentGames };
    }
    // ── Leaderboard ──
    getLeaderboard(limit = 25) {
        const rows = stmts.getLeaderboard.all(limit);
        return rows.map(row => {
            const user = rowToUser(row);
            const winRate = user.stats.gamesPlayed > 0
                ? Math.round((user.stats.gamesWon / user.stats.gamesPlayed) * 100)
                : 0;
            return { ...sanitizeUser(user), winRate };
        });
    }
    // ── Game Recording ──
    recordGame(roomId, results) {
        const gameId = generateId('g');
        const now = Date.now();
        const recordGameTx = db.transaction(() => {
            stmts.insertGameRecord.run(gameId, roomId, now);
            for (const r of results) {
                stmts.insertGamePlayer.run(gameId, r.userId || null, r.playerName, r.color, r.forfeited ? 999 : r.squaresRemaining, r.rank, r.forfeited ? 1 : 0);
                // Update user stats if authenticated
                if (!r.userId)
                    continue;
                const userRow = stmts.getUserById.get(r.userId);
                if (!userRow)
                    continue;
                const isWinner = r.rank === 1 && !r.forfeited;
                const gamesPlayed = userRow.games_played + 1;
                const gamesWon = userRow.games_won + (isWinner ? 1 : 0);
                const gamesLost = userRow.games_lost + (isWinner ? 0 : 1);
                const squaresPlaced = Math.max(0, 89 - r.squaresRemaining);
                const totalSquaresPlaced = userRow.total_squares_placed + squaresPlaced;
                let bestScore = userRow.best_score;
                if (!r.forfeited && (bestScore === -1 || r.squaresRemaining < bestScore)) {
                    bestScore = r.squaresRemaining;
                }
                let currentStreak = isWinner ? userRow.current_streak + 1 : 0;
                let winStreak = Math.max(userRow.win_streak, currentStreak);
                stmts.updateStats.run(gamesPlayed, gamesWon, gamesLost, totalSquaresPlaced, bestScore, winStreak, currentStreak, r.userId);
            }
        });
        recordGameTx();
        console.log(`[UserStore] Game recorded: ${gameId} — ${results.length} players`);
    }
    // ── Private ──
    createToken(userId) {
        const token = `auth_${crypto.randomBytes(16).toString('hex')}`;
        stmts.insertToken.run(token, userId, Date.now());
        return token;
    }
}
export const userStore = new UserStore();
