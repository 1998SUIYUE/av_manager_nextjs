
import fs from 'fs/promises';
import { devWithTimestamp } from '@/utils/logger';
import { getEloRatingsCachePath } from '@/utils/paths';

// ==================================
// Interfaces and Constants
// ==================================

export interface EloRating {
  code: string;
  elo: number;
  matchCount: number;
  winCount: number;
  lossCount: number;
  drawCount: number;
  lastRated: number;
}

const CACHE_FILE_PATH = getEloRatingsCachePath();
const WRITE_BATCH_DELAY = 1000;

// ==================================
// In-Memory Cache Implementation
// ==================================

let inMemoryCache: Map<string, EloRating> | null = null;
let isCacheLoading = false;

async function getMemoryCache(): Promise<Map<string, EloRating>> {
  if (inMemoryCache) {
    return inMemoryCache;
  }

  if (isCacheLoading) {
    await new Promise<void>(resolve => {
      const interval = setInterval(() => {
        if (!isCacheLoading) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
    return inMemoryCache!;
  }

  isCacheLoading = true;
  try {
    devWithTimestamp('[EloCache] Cache miss. Loading from disk...');
    const cacheArray = await readCacheUnsafe();
    inMemoryCache = new Map(cacheArray.map(item => [item.code, item]));
    devWithTimestamp(`[EloCache] Loaded ${inMemoryCache.size} items into memory.`);
    return inMemoryCache;
  } finally {
    isCacheLoading = false;
  }
}

async function readCacheUnsafe(): Promise<EloRating[]> {
  try {
    const cacheContent = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
    return JSON.parse(cacheContent || '[]');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    devWithTimestamp('[EloCache] Failed to read or parse cache file:', error);
    return [];
  }
}

async function writeCacheToDisk(cache: Map<string, EloRating>): Promise<void> {
    const cacheArray = Array.from(cache.values());
    const jsonString = JSON.stringify(cacheArray, null, 2);
    const tmpFile = CACHE_FILE_PATH + '.tmp';

    try {
        await fs.writeFile(tmpFile, jsonString, 'utf-8');
        await fs.rename(tmpFile, CACHE_FILE_PATH);
        devWithTimestamp(`[EloCache] Successfully wrote ${cacheArray.length} items to disk.`);
    } catch (error) {
        devWithTimestamp('[EloCache] Error writing cache to disk:', error);
    }
}

// ==================================
// Public API for the Cache
// ==================================

export async function getAllEloRatings(): Promise<Map<string, EloRating>> {
    return await getMemoryCache();
}

export async function getEloRating(code: string): Promise<EloRating | null> {
  const cache = await getMemoryCache();
  return cache.get(code) || null;
}

export async function updateEloRating(
  code: string,
  updates: Partial<EloRating>
) {
    const cache = await getMemoryCache();
    const existing = cache.get(code) || {
        code,
        elo: 1000,
        matchCount: 0,
        winCount: 0,
        lossCount: 0,
        drawCount: 0,
        lastRated: 0,
    };

    const updatedEntry: EloRating = {
      ...existing,
      ...updates,
      lastRated: Date.now(),
    };

    cache.set(code, updatedEntry);
    scheduleDiskWrite(cache);
}

// ==================================
// Debounced Disk Writing
// ==================================

let writeTimer: NodeJS.Timeout | null = null;

function scheduleDiskWrite(cache: Map<string, EloRating>) {
  if (writeTimer) {
    clearTimeout(writeTimer);
  }

  writeTimer = setTimeout(() => {
    writeCacheToDisk(new Map(cache));
  }, WRITE_BATCH_DELAY);
}
