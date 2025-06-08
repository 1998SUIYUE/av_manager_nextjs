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
let _cacheFileLastModified: number | null = null; // 添加缓存文件最后修改时间戳
let _lastStatCheckTime: number | null = null; // 记录上次检查文件stats的时间
const STAT_CHECK_INTERVAL_MS = 1000; // 每1秒才重新检查一次文件stats

async function readCache(): Promise<MovieMetadata[]> {
  // 如果内存缓存已加载且未到检查时间间隔，直接返回内存缓存
  if (_cache !== null && _lastStatCheckTime !== null && 
      (Date.now() - _lastStatCheckTime) < STAT_CHECK_INTERVAL_MS) {
    // console.log('[readCache] 从内存缓存中快速读取 (在间隔内)');
    return _cache!;
  }

  try {
    const stats = await fs.stat(CACHE_FILE_PATH); 
    _lastStatCheckTime = Date.now(); // 更新检查时间

    // 如果缓存未加载或文件被外部修改，则重新加载
    if (_cache === null || stats.mtimeMs > (_cacheFileLastModified || 0)) {
      // console.log('[readCache] 检测到外部更新或首次加载，重新从文件读取');
      const cacheContent = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
      if (!cacheContent || cacheContent.trim() === '') {
        _cache = [];
      } else {
        _cache = JSON.parse(cacheContent);
      }
      _cacheFileLastModified = stats.mtimeMs; // 更新时间戳
    } else {
      // console.log('[readCache] 从内存缓存中读取');
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      console.log('[readCache] 缓存文件不存在，初始化为空缓存');
      _cache = [];
      _cacheFileLastModified = Date.now(); // 设置一个时间戳，表示文件不存在但缓存已初始化
    } else {
      console.error('Error accessing movie metadata cache file:', error);
      _cache = []; // 其他读取错误，清空缓存
      _cacheFileLastModified = null; // 无效时间戳
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
    // 成功写入后，立即更新内存缓存和时间戳
    _cache = cache; 
    const stats = await fs.stat(CACHE_FILE_PATH);
    _cacheFileLastModified = stats.mtimeMs;
    _lastStatCheckTime = Date.now(); // 更新检查时间
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
