import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import {
  getAppDatabasePath,
  getEloRatingsCachePath,
  getMovieMetadataCachePath,
  getPlaybackHistoryCachePath,
} from "@/utils/paths";
import { devWithTimestamp } from "@/utils/logger";

let database: DatabaseSync | null = null;

function readJsonArray<T>(filePath: string): T[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(content || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    devWithTimestamp(`[Database] Failed to read JSON cache: ${filePath}`, error);
    return [];
  }
}

function json(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function boolToInt(value: unknown): number {
  return value ? 1 : 0;
}

function migrateMovieMetadata(db: DatabaseSync) {
  const count = db.prepare("SELECT COUNT(*) AS count FROM movie_metadata").get() as { count: number };
  if (count.count > 0) return;

  const items = readJsonArray<any>(getMovieMetadataCachePath());
  if (items.length === 0) return;

  const insert = db.prepare(`
    INSERT OR REPLACE INTO movie_metadata (
      code, cover_url, title, actress, last_updated, kinds, elo, match_count,
      win_count, draw_count, loss_count, last_rated, recent_matches
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    for (const item of items) {
      if (!item?.code) continue;
      insert.run(
        String(item.code).toUpperCase(),
        item.coverUrl ?? null,
        item.title ?? null,
        item.actress ?? null,
        Number(item.lastUpdated || Date.now()),
        json(item.kinds),
        item.elo ?? null,
        item.matchCount ?? null,
        item.winCount ?? null,
        item.drawCount ?? null,
        item.lossCount ?? null,
        item.lastRated ?? null,
        json(item.recentMatches)
      );
    }
    db.exec("COMMIT");
    devWithTimestamp(`[Database] Migrated ${items.length} movie metadata rows from JSON.`);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateEloRatings(db: DatabaseSync) {
  const count = db.prepare("SELECT COUNT(*) AS count FROM elo_ratings").get() as { count: number };
  if (count.count > 0) return;

  const items = readJsonArray<any>(getEloRatingsCachePath());
  if (items.length === 0) return;

  const insert = db.prepare(`
    INSERT OR REPLACE INTO elo_ratings (
      code, elo, match_count, win_count, loss_count, draw_count, last_rated
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    for (const item of items) {
      if (!item?.code) continue;
      insert.run(
        String(item.code).toUpperCase(),
        Number(item.elo ?? 1000),
        Number(item.matchCount ?? 0),
        Number(item.winCount ?? 0),
        Number(item.lossCount ?? 0),
        Number(item.drawCount ?? 0),
        Number(item.lastRated ?? 0)
      );
    }
    db.exec("COMMIT");
    devWithTimestamp(`[Database] Migrated ${items.length} Elo rating rows from JSON.`);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migratePlaybackHistory(db: DatabaseSync) {
  const count = db.prepare("SELECT COUNT(*) AS count FROM playback_history").get() as { count: number };
  if (count.count > 0) return;

  const items = readJsonArray<any>(getPlaybackHistoryCachePath());
  if (items.length === 0) return;

  const insert = db.prepare(`
    INSERT OR REPLACE INTO playback_history (
      absolute_path, filename, code, current_time, duration, progress,
      play_count, completed_count, first_played_at, last_played_at, watched
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    for (const item of items) {
      if (!item?.absolutePath) continue;
      insert.run(
        path.resolve(String(item.absolutePath)),
        item.filename || path.basename(String(item.absolutePath)),
        item.code ?? null,
        Number(item.currentTime ?? 0),
        Number(item.duration ?? 0),
        Number(item.progress ?? 0),
        Number(item.playCount ?? 0),
        Number(item.completedCount ?? 0),
        Number(item.firstPlayedAt ?? Date.now()),
        Number(item.lastPlayedAt ?? Date.now()),
        boolToInt(item.watched)
      );
    }
    db.exec("COMMIT");
    devWithTimestamp(`[Database] Migrated ${items.length} playback history rows from JSON.`);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function createSchema(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS movie_metadata (
      code TEXT PRIMARY KEY,
      cover_url TEXT,
      title TEXT,
      actress TEXT,
      last_updated INTEGER NOT NULL,
      kinds TEXT,
      elo INTEGER,
      match_count INTEGER,
      win_count INTEGER,
      draw_count INTEGER,
      loss_count INTEGER,
      last_rated INTEGER,
      recent_matches TEXT
    );

    CREATE TABLE IF NOT EXISTS elo_ratings (
      code TEXT PRIMARY KEY,
      elo INTEGER NOT NULL DEFAULT 1000,
      match_count INTEGER NOT NULL DEFAULT 0,
      win_count INTEGER NOT NULL DEFAULT 0,
      loss_count INTEGER NOT NULL DEFAULT 0,
      draw_count INTEGER NOT NULL DEFAULT 0,
      last_rated INTEGER NOT NULL DEFAULT 0,
      sigma REAL NOT NULL DEFAULT 300
    );

    CREATE TABLE IF NOT EXISTS playback_history (
      absolute_path TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      code TEXT,
      current_time REAL NOT NULL DEFAULT 0,
      duration REAL NOT NULL DEFAULT 0,
      progress REAL NOT NULL DEFAULT 0,
      play_count INTEGER NOT NULL DEFAULT 0,
      completed_count INTEGER NOT NULL DEFAULT 0,
      first_played_at INTEGER NOT NULL,
      last_played_at INTEGER NOT NULL,
      watched INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS match_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code_a TEXT NOT NULL,
      code_b TEXT NOT NULL,
      result TEXT NOT NULL,
      elo_before_a REAL NOT NULL,
      elo_after_a REAL NOT NULL,
      elo_before_b REAL NOT NULL,
      elo_after_b REAL NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_match_log_created ON match_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_movie_metadata_last_updated ON movie_metadata(last_updated DESC);
    CREATE INDEX IF NOT EXISTS idx_elo_ratings_elo ON elo_ratings(elo DESC);
    CREATE INDEX IF NOT EXISTS idx_playback_history_last_played ON playback_history(last_played_at DESC);
  `);
}

/**
 * 老库升级：CREATE TABLE IF NOT EXISTS 不会给已存在的表补新列，这里按需 ALTER。
 */
function ensureColumns(db: DatabaseSync) {
  const eloCols = new Set(
    (db.prepare("PRAGMA table_info(elo_ratings)").all() as { name: string }[]).map((col) => col.name)
  );
  if (!eloCols.has("sigma")) {
    db.exec("ALTER TABLE elo_ratings ADD COLUMN sigma REAL NOT NULL DEFAULT 300");
    devWithTimestamp("[Database] Added sigma column to elo_ratings.");
  }
}

export function getDatabase(): DatabaseSync {
  if (database) return database;

  const databasePath = getAppDatabasePath();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  database = new DatabaseSync(databasePath);
  createSchema(database);
  ensureColumns(database);
  migrateMovieMetadata(database);
  migrateEloRatings(database);
  migratePlaybackHistory(database);
  return database;
}

export function parseJsonArray(value: unknown): string[] | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : undefined;
  } catch {
    return undefined;
  }
}

