import path from "path";
import { getDatabase } from "@/lib/appDatabase";

export type PlaybackEventType = "start" | "progress" | "ended";

export interface PlaybackHistory {
  absolutePath: string;
  filename: string;
  code?: string;
  currentTime: number;
  duration: number;
  progress: number;
  playCount: number;
  completedCount: number;
  firstPlayedAt: number;
  lastPlayedAt: number;
  watched: boolean;
}

export interface PlaybackHistoryUpdate {
  event: PlaybackEventType;
  absolutePath: string;
  filename?: string;
  code?: string;
  currentTime?: number;
  duration?: number;
}

type PlaybackHistoryRow = {
  absolute_path: string;
  filename: string;
  code: string | null;
  current_time: number;
  duration: number;
  progress: number;
  play_count: number;
  completed_count: number;
  first_played_at: number;
  last_played_at: number;
  watched: number;
};

const WATCHED_PROGRESS_THRESHOLD = 0.9;
const WATCHED_REMAINING_SECONDS = 120;

function toPlaybackHistory(row: PlaybackHistoryRow): PlaybackHistory {
  return {
    absolutePath: row.absolute_path,
    filename: row.filename,
    code: row.code || undefined,
    currentTime: row.current_time,
    duration: row.duration,
    progress: row.progress,
    playCount: row.play_count,
    completedCount: row.completed_count,
    firstPlayedAt: row.first_played_at,
    lastPlayedAt: row.last_played_at,
    watched: row.watched === 1,
  };
}

function normalizeFiniteSeconds(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}

function calculateProgress(currentTime: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  return Math.min(Math.max(currentTime / duration, 0), 1);
}

function isWatched(currentTime: number, duration: number, progress: number): boolean {
  if (!Number.isFinite(duration) || duration <= 0) {
    return false;
  }
  return progress >= WATCHED_PROGRESS_THRESHOLD || duration - currentTime <= WATCHED_REMAINING_SECONDS;
}

export async function getAllPlaybackHistory(): Promise<Map<string, PlaybackHistory>> {
  const rows = getDatabase()
    .prepare("SELECT * FROM playback_history ORDER BY last_played_at DESC")
    .all() as PlaybackHistoryRow[];
  return new Map(rows.map((row) => [row.absolute_path, toPlaybackHistory(row)]));
}

export async function getPlaybackHistory(absolutePath: string): Promise<PlaybackHistory | null> {
  const normalizedPath = path.resolve(absolutePath);
  const row = getDatabase()
    .prepare("SELECT * FROM playback_history WHERE absolute_path = ?")
    .get(normalizedPath) as PlaybackHistoryRow | undefined;
  return row ? toPlaybackHistory(row) : null;
}

export async function recordPlaybackHistory(update: PlaybackHistoryUpdate): Promise<PlaybackHistory> {
  const absolutePath = path.resolve(update.absolutePath);
  const now = Date.now();
  const existing = await getPlaybackHistory(absolutePath);

  const duration = normalizeFiniteSeconds(update.duration ?? existing?.duration ?? 0);
  let currentTime = normalizeFiniteSeconds(update.currentTime ?? existing?.currentTime ?? 0);

  if (update.event === "ended" && duration > 0) {
    currentTime = duration;
  }

  const progress = calculateProgress(currentTime, duration);
  const watched = existing?.watched || update.event === "ended" || isWatched(currentTime, duration, progress);

  const next: PlaybackHistory = {
    absolutePath,
    filename: update.filename || existing?.filename || path.basename(absolutePath),
    code: update.code || existing?.code,
    currentTime: watched && duration > 0 ? duration : currentTime,
    duration,
    progress: watched && duration > 0 ? 1 : progress,
    playCount: (existing?.playCount || 0) + (update.event === "start" ? 1 : 0),
    completedCount: (existing?.completedCount || 0) + (update.event === "ended" && !existing?.watched ? 1 : 0),
    firstPlayedAt: existing?.firstPlayedAt || now,
    lastPlayedAt: now,
    watched,
  };

  getDatabase()
    .prepare(`
      INSERT INTO playback_history (
        absolute_path, filename, code, current_time, duration, progress,
        play_count, completed_count, first_played_at, last_played_at, watched
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(absolute_path) DO UPDATE SET
        filename = excluded.filename,
        code = excluded.code,
        current_time = excluded.current_time,
        duration = excluded.duration,
        progress = excluded.progress,
        play_count = excluded.play_count,
        completed_count = excluded.completed_count,
        first_played_at = excluded.first_played_at,
        last_played_at = excluded.last_played_at,
        watched = excluded.watched
    `)
    .run(
      next.absolutePath,
      next.filename,
      next.code ?? null,
      next.currentTime,
      next.duration,
      next.progress,
      next.playCount,
      next.completedCount,
      next.firstPlayedAt,
      next.lastPlayedAt,
      next.watched ? 1 : 0
    );

  return next;
}
