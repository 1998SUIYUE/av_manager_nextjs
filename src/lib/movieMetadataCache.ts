import fs from 'fs/promises';
import path from 'path';
import { logWithTimestamp, warnWithTimestamp, errorWithTimestamp } from '@/utils/logger';

// 定义电影元数据接口，表示缓存中存储的每条电影信息结构
export interface MovieMetadata {
  code: string; // 电影番号 (例如: 'ABC-123')
  coverUrl: string | null; // 封面图片URL
  title: string | null; // 电影标题
  actress: string | null; // 女优名字
  lastUpdated: number; // 最后一次更新时间戳 (毫秒)
}

// 缓存文件在项目根目录的绝对路径
const CACHE_FILE_PATH = path.join(process.cwd(), 'movie-metadata-cache.json');

// 内存中的电影元数据缓存，初始为 null (未加载状态)
let _cache: MovieMetadata[] | null = null; 

/**
 * 从缓存中获取指定电影番号的元数据。
 * 这是前端请求电影元数据时，后端首先会调用的函数。
 * @param code 电影番号。
 * @returns 对应的电影元数据，如果未找到则返回 null。
 */
export async function getCachedMovieMetadata(code: string, baseUrl: string): Promise<MovieMetadata | null> {
  logWithTimestamp(`[getCachedMovieMetadata] 尝试获取番号 ${code} 的缓存`);
  // 1. 首先尝试从内存缓存中查找
  const cache = await readCache(); // 内部会处理文件读取
  const found = cache.find(m => m.code === code);

  // 如果找到缓存条目，并且其 coverUrl 仍然是外部链接，则尝试本地化
  if (found && found.coverUrl && (found.coverUrl.startsWith('http://') || found.coverUrl.startsWith('https://'))) {
    logWithTimestamp(`[getCachedMovieMetadata] 番号 ${code} 发现外部封面URL，尝试本地化: ${found.coverUrl}`);
    try {
      // 使用 baseUrl 构建完整的 image-proxy URL
      const proxyApiUrl = `${baseUrl}/api/image-proxy?url=${encodeURIComponent(found.coverUrl)}`;
      logWithTimestamp(`[getCachedMovieMetadata] 调用 image-proxy API URL: ${proxyApiUrl}`);
      const imageProxyResponse = await fetch(proxyApiUrl);
      if (imageProxyResponse.ok) {
        const proxyData = await imageProxyResponse.json();
        const localCoverUrl = proxyData.imageUrl;
        logWithTimestamp(`[getCachedMovieMetadata] 图片已通过 image-proxy 缓存到本地: ${localCoverUrl}`);
        
        // 更新找到的缓存条目，并写入磁盘
        found.coverUrl = localCoverUrl; 
        await updateMovieMetadataCache(found.code, found.coverUrl, found.title, found.actress); // 持久化更新
        logWithTimestamp(`[getCachedMovieMetadata] 番号 ${code} 的封面URL已更新并持久化到本地`);
      } else {
        errorWithTimestamp(`[getCachedMovieMetadata] 调用 image-proxy 失败: ${imageProxyResponse.statusText}`);
        // 如果代理失败，可以考虑使用默认图片或者保留原始URL，但不再尝试本地化
      }
    } catch (proxyError) {
      errorWithTimestamp(`[getCachedMovieMetadata] 调用 image-proxy 发生错误: ${proxyError}`);
      // 发生错误时，将 found 设为 null 或者不修改 found.coverUrl，以便后续处理
    }
  }

  if (found) {
    logWithTimestamp(`[getCachedMovieMetadata] 番号 ${code} 在缓存中找到`);
    return found;
  }
  logWithTimestamp(`[getCachedMovieMetadata] 番号 ${code} 未在缓存中找到`);
  return null;
}

/**
 * 更新指定电影番号的元数据到缓存和磁盘文件。
 * 当从外部成功获取到电影元数据后，会调用此函数进行缓存更新。
 * @param code 电影番号。
 * @param coverUrl 封面图片URL。
 * @param title 电影标题。
 * @param actress 女优名字。
 */
export async function updateMovieMetadataCache(code: string, coverUrl: string | null, title: string | null, actress: string | null) {
  logWithTimestamp(`[updateMovieMetadataCache] 更新番号 ${code} 的缓存`);
  // 1. 读取当前缓存 (会从文件或内存获取最新数据)
  const cache = await readCache();
  const now = Date.now();

  // 2. 查找并更新现有条目或添加新条目
  const existingIndex = cache.findIndex(m => m.code === code);
  if (existingIndex !== -1) {
    // 如果找到现有条目，则更新其信息
    cache[existingIndex] = {
      code, coverUrl, title, actress, lastUpdated: now
    };
    logWithTimestamp(`[updateMovieMetadataCache] 更新现有缓存条目: ${code}`);
  } else {
    // 如果是新条目，则添加到缓存列表的开头 (最近更新的在前)
    cache.unshift({
      code, coverUrl, title, actress, lastUpdated: now
    });
    logWithTimestamp(`[updateMovieMetadataCache] 添加新缓存条目: ${code}`);
  }

  // 3. 将更新后的缓存写入磁盘文件
  await writeCache(cache);
  logWithTimestamp(`[updateMovieMetadataCache] 番号 ${code} 缓存更新并写入磁盘完成`);
}

/**
 * 从磁盘读取电影元数据缓存文件，并维护内存缓存。
 * 此函数现在仅在内存缓存为空时才从文件读取。
 * @returns 电影元数据数组。
 */
async function readCache(): Promise<MovieMetadata[]> {
  // 如果内存缓存已经存在，直接返回内存中的数据
  if (_cache !== null) {
    logWithTimestamp('[readCache] 从内存缓存中读取');
    return _cache; // 此时_cache保证为 MovieMetadata[]
  }

  // 如果内存缓存为空，则尝试从磁盘文件读取
  logWithTimestamp('[readCache] 内存缓存为空，尝试从文件读取...');
  try {
    const cacheContent = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
    if (!cacheContent || cacheContent.trim() === '') {
      // 如果文件内容为空，则初始化一个空缓存
      _cache = [];
      logWithTimestamp('[readCache] 缓存文件内容为空，初始化为空缓存');
    } else {
      // 解析 JSON 内容并更新内存缓存
      _cache = JSON.parse(cacheContent);
      logWithTimestamp('[readCache] 从文件加载并更新内存缓存');
    }
  } catch (error: unknown) {
    // 捕获文件操作中可能发生的错误
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      // 如果文件不存在 (ENOENT 错误码)，则初始化一个空缓存
      logWithTimestamp('[readCache] 缓存文件不存在，初始化为空缓存');
      _cache = [];
    } else {
      // 处理其他读取错误，清空缓存并记录错误信息
      errorWithTimestamp('Error accessing movie metadata cache file:', error);
      _cache = []; // 其他读取错误，清空缓存
    }
  }
  return _cache!; // 返回内存缓存，由于逻辑保证，_cache 在此始终为 MovieMetadata[] 类型
}

/**
 * 将电影元数据缓存写入磁盘文件。
 * 此函数会进行原子性写入，确保数据完整性。
 * @param cache 要写入的电影元数据数组。
 */
async function writeCache(cache: MovieMetadata[]) {
  logWithTimestamp('[writeCache] 开始写入缓存到磁盘');
  // 写入前校验数据有效性，避免写入空数组或无效数据，防止覆盖掉有效数据
  if (!Array.isArray(cache) || cache.length === 0) {
    warnWithTimestamp('[writeCache] 拒绝写入空缓存或无效数据，保留原有内容');
    return;
  }
  
  // 使用临时文件进行原子性写入，防止文件损坏
  const tmpFile = CACHE_FILE_PATH + '.tmp';
  const jsonString = JSON.stringify(cache, null, 2);
  
  try {
    // 1. 将数据写入临时文件
    logWithTimestamp(`[writeCache] 写入临时文件: ${tmpFile}`);
    await fs.writeFile(tmpFile, jsonString, 'utf-8');
    
    // 2. 将临时文件重命名为正式文件 (原子操作)
    logWithTimestamp(`[writeCache] 重命名临时文件到: ${CACHE_FILE_PATH}`);
    await fs.rename(tmpFile, CACHE_FILE_PATH);
    
    // 3. 更新内存缓存
    _cache = cache; // 将新写入的缓存内容同步到内存
    logWithTimestamp('[writeCache] 缓存成功写入磁盘并同步内存');
  } catch (error) {
    errorWithTimestamp('[writeCache] 写入缓存文件失败:', error); // 记录写入失败的错误
  }
}
