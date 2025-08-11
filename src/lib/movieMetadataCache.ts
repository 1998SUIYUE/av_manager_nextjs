import fs from 'fs/promises';
import { devWithTimestamp, prodWithTimestamp } from '@/utils/logger';
import { getMovieMetadataCachePath } from '@/utils/paths';

// ==================================
// Interfaces and Constants
// ==================================

export interface MovieMetadata {
  code: string;
  coverUrl: string | null;
  title: string | null;
  actress: string | null;
  lastUpdated: number;
  kinds?: string[];
  elo?: number;
  matchCount?: number;
  winCount?: number;
  drawCount?: number;
  lossCount?: number;
  lastRated?: number;
  recentMatches?: string[];
}

const CACHE_FILE_PATH = getMovieMetadataCachePath();
const LOCK_FILE_PATH = CACHE_FILE_PATH + '.lock';
const LOCK_TIMEOUT = 30000;
const WRITE_BATCH_DELAY = 1000;

// ==================================
// In-Memory Cache Implementation
// ==================================

// The single source of truth for the cache in memory.
let inMemoryCache: Map<string, MovieMetadata> | null = null;
let isCacheLoading = false;

/**
 * Loads the cache from disk into memory if it hasn't been loaded yet.
 * Returns a Map for quick lookups.
 */
async function getMemoryCache(): Promise<Map<string, MovieMetadata>> {
  if (inMemoryCache) {
    return inMemoryCache;
  }

  // Prevent multiple concurrent loads
  if (isCacheLoading) {
    // Wait for the ongoing load to finish
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
    devWithTimestamp('[MemoryCache] Cache miss. Loading from disk...');
    const cacheArray = await readCacheUnsafe();
    inMemoryCache = new Map(cacheArray.map(item => [item.code, item]));
    devWithTimestamp(`[MemoryCache] Loaded ${inMemoryCache.size} items into memory.`);
    return inMemoryCache;
  } finally {
    isCacheLoading = false;
  }
}

/**
 * Reads the cache file from disk without any locks. 
 * This is the base function to populate the in-memory cache.
 */
async function readCacheUnsafe(): Promise<MovieMetadata[]> {
  try {
    const cacheContent = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
    return JSON.parse(cacheContent || '[]');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return []; // File doesn't exist, return empty array
    }
    devWithTimestamp('[readCacheUnsafe] Failed to read or parse cache file:', error);
    return []; // Return empty array on other errors to prevent crash
  }
}

/**
 * Writes the entire cache to disk. The in-memory representation is the source of truth.
 */
async function writeCacheToDisk(cache: Map<string, MovieMetadata>): Promise<void> {
    const cacheArray = Array.from(cache.values());
    const jsonString = JSON.stringify(cacheArray, null, 2);
    const tmpFile = CACHE_FILE_PATH + '.tmp';

    try {
        await fs.writeFile(tmpFile, jsonString, 'utf-8');
        await fs.rename(tmpFile, CACHE_FILE_PATH);
        devWithTimestamp(`[writeCacheToDisk] Successfully wrote ${cacheArray.length} items to disk.`);
    } catch (error) {
        devWithTimestamp('[writeCacheToDisk] Error writing cache to disk:', error);
    }
}

// ==================================
// Public API for the Cache
// ==================================

/**
 * Gets all cached metadata, primarily from memory.
 */
export async function getAllCachedMovieMetadata(): Promise<Map<string, MovieMetadata>> {
    return await getMemoryCache();
}

/**
 * Gets metadata for a single movie by its code from the in-memory cache.
 */
export async function getCachedMovieMetadata(code: string): Promise<MovieMetadata | null> {
  const cache = await getMemoryCache();
  return cache.get(code) || null;
}

/**
 * Updates metadata for a movie. It updates the in-memory cache and then
 * triggers a debounced write to disk.
 */
export async function updateMovieMetadataCache(
  code: string, 
  coverUrl: string | null, 
  title: string | null, 
  actress: string | null,
  kinds?: string[] | null,
  eloData?: Partial<MovieMetadata>
) {
    const cache = await getMemoryCache();
    const existing = cache.get(code) || { code, elo: 1000 }; // Provide default elo for new entries

    const updatedEntry: MovieMetadata = {
        ...existing,
        coverUrl: coverUrl !== undefined ? coverUrl : existing.coverUrl,
        title: title !== undefined ? title : existing.title,
        actress: actress !== undefined ? actress : existing.actress,
        kinds: kinds !== undefined ? kinds : existing.kinds,
        lastUpdated: Date.now(),
        ...(eloData || {}),
    };

    cache.set(code, updatedEntry);
    // Debounce the disk write
    scheduleDiskWrite(cache);
}

// ==================================
// Debounced Disk Writing
// ==================================

let writeTimer: NodeJS.Timeout | null = null;

function scheduleDiskWrite(cache: Map<string, MovieMetadata>) {
  if (writeTimer) {
    clearTimeout(writeTimer);
  }

  writeTimer = setTimeout(() => {
    // Use a copy of the cache at the time of scheduling
    withFileLock(() => writeCacheToDisk(new Map(cache)));
  }, WRITE_BATCH_DELAY);
}

// ==================================
// File Locking Utility (to prevent concurrent writes)
// ==================================

async function acquireLock(): Promise<() => void> {
    // Simplified lock for brevity. In a real-world scenario, a more robust library like 'proper-lockfile' would be better.
    const startTime = Date.now();
    while (true) {
        try {
            await fs.mkdir(LOCK_FILE_PATH); // Atomic operation
            return async () => {
                await fs.rmdir(LOCK_FILE_PATH);
            };
        } catch (e: any) {
            if (e.code !== 'EEXIST') throw e;
            if (Date.now() - startTime > LOCK_TIMEOUT) {
                throw new Error('Failed to acquire lock, timeout.');
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
}

async function withFileLock<T>(operation: () => Promise<T>): Promise<T> {
  const releaseLock = await acquireLock();
  try {
    return await operation();
  } finally {
    await releaseLock();
  }
}