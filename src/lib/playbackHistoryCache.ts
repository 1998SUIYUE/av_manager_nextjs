import fs from "fs/promises";
import path from "path";
import { devWithTimestamp } from "@/utils/logger";
import { getPlaybackHistoryCachePath } from "@/utils/paths";

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

const CACHE_FILE_PATH = getPlaybackHistoryCachePath();
const WRITE_BATCH_DELAY = 750;
const WATCHED_PROGRESS_THRESHOLD = 0.9;
const WATCHED_REMAINING_SECONDS = 120;

let inMemoryCache: Map<string, PlaybackHistory> | null = null;
let isCacheLoading = false;
let writeTimer: NodeJS.Timeout | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function ensureCacheDirectory() {
  await fs.mkdir(path.dirname(CACHE_FILE_PATH), { recursive: true });
}

async function readCacheUnsafe(): Promise<PlaybackHistory[]> {
  try {
    const cacheContent = await fs.readFile(CACHE_FILE_PATH, "utf-8");
    return JSON.parse(cacheContent || "[]");
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return [];
    }
    devWithTimestamp("[PlaybackHistory] Failed to read cache:", error);
    return [];
  }
}

async function getMemoryCache(): Promise<Map<string, PlaybackHistory>> {
  if (inMemoryCache) {
    return inMemoryCache;
  }

  if (isCacheLoading) {
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (!isCacheLoading) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });
    return inMemoryCache!;
  }

  isCacheLoading = true;
  try {
    const cacheArray = await readCacheUnsafe();
    inMemoryCache = new Map(cacheArray.map((item) => [item.absolutePath, item]));
    return inMemoryCache;
  } finally {
    isCacheLoading = false;
  }
}

async function writeCacheToDisk(cache: Map<string, PlaybackHistory>): Promise<void> {
  await ensureCacheDirectory();
  const cacheArray = Array.from(cache.values()).sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
  const tmpFile = CACHE_FILE_PATH + ".tmp";
  await fs.writeFile(tmpFile, JSON.stringify(cacheArray, null, 2), "utf-8");
  await fs.rename(tmpFile, CACHE_FILE_PATH);
}

function scheduleDiskWrite(cache: Map<string, PlaybackHistory>) {
  if (writeTimer) {
    clearTimeout(writeTimer);
  }

  writeTimer = setTimeout(() => {
    const snapshot = new Map(cache);
    writeQueue = writeQueue
      .then(() => writeCacheToDisk(snapshot))
      .catch((error) => devWithTimestamp("[PlaybackHistory] Failed to write cache:", error));
  }, WRITE_BATCH_DELAY);
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
  return getMemoryCache();
}

export async function getPlaybackHistory(absolutePath: string): Promise<PlaybackHistory | null> {
  const cache = await getMemoryCache();
  return cache.get(absolutePath) || null;
}

export async function recordPlaybackHistory(update: PlaybackHistoryUpdate): Promise<PlaybackHistory> {
  const cache = await getMemoryCache();
  const absolutePath = path.resolve(update.absolutePath);
  const now = Date.now();
  const existing = cache.get(absolutePath);

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

  cache.set(absolutePath, next);
  scheduleDiskWrite(cache);
  return next;
}
