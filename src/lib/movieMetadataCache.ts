import fs from 'fs/promises';
import path from 'path';

interface MovieMetadata {
  code: string;
  coverUrl: string | null;
  title: string | null;
  actress: string | null;
  lastUpdated: number;
}

const CACHE_FILE_PATH = path.join(process.cwd(), 'movie-metadata-cache.json');
const CACHE_EXPIRATION_DAYS = 30;

async function readCache(): Promise<MovieMetadata[]> {
  try {
    const cacheContent = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
    return JSON.parse(cacheContent);
  } catch (error) {
    console.error('Error reading movie metadata cache:', error);
    return [];
  }
}

async function writeCache(cache: MovieMetadata[]) {
  await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
}

export async function getCachedMovieMetadata(code: string): Promise<MovieMetadata | null> {
  const cache = await readCache();
  const cachedMetadata = cache.find(item => item.code === code);

  if (cachedMetadata) {
    // 检查缓存是否过期
    const currentTime = Date.now();
    const daysSinceUpdate = (currentTime - cachedMetadata.lastUpdated) / (1000 * 60 * 60 * 24);
    
    if (daysSinceUpdate < CACHE_EXPIRATION_DAYS) {
      return cachedMetadata;
    }
  }

  return null;
}

export async function updateMovieMetadataCache(
  code: string, 
  coverUrl: string | null, 
  title: string | null,
  actress: string | null
) {
  try {
    let cache: MovieMetadata[] = await readCache();

    const existingIndex = cache.findIndex(item => item.code === code);
    const newEntry: MovieMetadata = {
      code,
      coverUrl,
      title,
      actress,
      lastUpdated: Date.now()
    };

    if (existingIndex !== -1) {
      console.log(`[updateMovieMetadataCache] 更新缓存 - 番号: ${code}`);
      cache[existingIndex] = newEntry;
    } else {
      console.log(`[updateMovieMetadataCache] 添加缓存 - 番号: ${code}`);
      cache.push(newEntry);
    }

    // 按 lastUpdated 降序排序
    cache.sort((a, b) => b.lastUpdated - a.lastUpdated);

    // 限制缓存大小（例如，最多保留 500 个条目）
    const MAX_CACHE_SIZE = 500;
    if (cache.length > MAX_CACHE_SIZE) {
      cache = cache.slice(0, MAX_CACHE_SIZE);
    }
    
    await writeCache(cache);
  } catch (error) {
    console.error('Error updating movie metadata cache:', error);
  }
}