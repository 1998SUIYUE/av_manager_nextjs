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

let _cache: MovieMetadata[] | null = null; // 添加内存缓存变量

async function readCache(): Promise<MovieMetadata[]> {
  if (_cache === null) { // 确保只在未加载时读取文件
    try {
      const cacheContent = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
      if (!cacheContent || cacheContent.trim() === '') {
        _cache = [];
      } else {
        _cache = JSON.parse(cacheContent); // 缓存到内存
      }
    } catch (error) {
      console.error('Error reading movie metadata cache:', error);
      _cache = []; // 读取失败时清空缓存
    }
  }
  return _cache!; // 此时_cache保证为 MovieMetadata[]，使用非空断言
}

async function writeCache(cache: MovieMetadata[]) {
  // 写入前校验数据有效性，避免写入空数组或无效数据
  if (!Array.isArray(cache) || cache.length === 0) {
    console.warn('[writeCache] 拒绝写入空缓存，保留原有内容');
    return;
  }
  const tmpFile = CACHE_FILE_PATH + '.tmp';
  try {
    await fs.writeFile(tmpFile, JSON.stringify(cache, null, 2), 'utf-8');
    await fs.rename(tmpFile, CACHE_FILE_PATH);
  } catch (err) {
    console.error('[writeCache] 写入缓存失败，保留原有内容:', err);
    // 写入失败时不覆盖原有缓存
    try { await fs.unlink(tmpFile); } catch (_) {console.log('删除临时文件失败',_);}
  }
}

export async function getCachedMovieMetadata(code: string): Promise<MovieMetadata | null> {
  const cache = await readCache();
  const cachedMetadata = cache.find(item => item.code === code);

  if (cachedMetadata) {
    return cachedMetadata;
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
      console.log(`[updateMovieMetadataCache] 更新缓存 - 番号: ${code} 封面:${coverUrl} 番名:${title} 女优:${actress}`);
      cache[existingIndex] = newEntry;
    } else {
      console.log(`[updateMovieMetadataCache] 更新缓存 - 番号: ${code} 封面:${coverUrl} 番名:${title} 女优:${actress}`);
      cache.push(newEntry);
    }

    // 按 lastUpdated 降序排序
    cache.sort((a, b) => b.lastUpdated - a.lastUpdated);

    // 限制缓存大小（例如，最多保留 500 个条目）
    const MAX_CACHE_SIZE = 500;
    if (cache.length > MAX_CACHE_SIZE) {
      cache = cache.slice(0, MAX_CACHE_SIZE);
    }
    
    _cache = cache; // 更新内存缓存
    await writeCache(cache);
  } catch (error) {
    console.log('Error updating movie metadata cache:', error);
  }
}
