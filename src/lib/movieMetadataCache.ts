import fs from 'fs/promises';
// import fsSync from 'fs'; // 移除此行

import { devWithTimestamp } from '@/utils/logger';

// 定义电影元数据接口，表示缓存中存储的每条电影信息结构
export interface MovieMetadata {
  code: string; // 电影番号 (例如: 'ABC-123')
  coverUrl: string | null; // 封面图片URL
  title: string | null; // 电影标题
  actress: string | null; // 女优名字
  lastUpdated: number; // 最后一次更新时间戳 (毫秒)
  // Elo评分相关字段
  elo?: number; // Elo评分 (默认1000)
  matchCount?: number; // 对比次数
  winCount?: number; // 胜利次数
  drawCount?: number; // 平局次数
  lossCount?: number; // 失败次数
  lastRated?: number; // 最后评分时间
  recentMatches?: string[]; // 最近对比过的影片ID (避免重复)
}

import { getMovieMetadataCachePath } from '@/utils/paths';

// 缓存文件在用户数据目录的绝对路径
const CACHE_FILE_PATH = getMovieMetadataCachePath();
// 锁文件路径，用于防止并发写入冲突
const LOCK_FILE_PATH = CACHE_FILE_PATH + '.lock';
// 锁超时时间（毫秒），防止死锁
const LOCK_TIMEOUT = 30000; // 30秒

// 性能优化相关配置
// const READ_CACHE_TTL = 5000; // 读取缓存生存时间：5秒 // 移除此行
const WRITE_BATCH_DELAY = 1000; // 批量写入延迟：1秒
const WRITE_BATCH_SIZE = 10; // 批量写入大小：10个操作
const JSON_PRETTY_FORMAT = true; // JSON 格式化：true=可读性优先，false=性能优先


// 禁用短期内存缓存
// let _readCache: ReadCacheEntry | null = null;

// 批量写入队列
interface WriteOperation {
  code: string;
  coverUrl: string | null;
  title: string | null;
  actress: string | null;
  timestamp: number;
  // Elo评分相关数据
  elo?: number;
  matchCount?: number;
  winCount?: number;
  drawCount?: number;
  lossCount?: number;
  lastRated?: number;
  recentMatches?: string[];
}

let _writeQueue: WriteOperation[] = [];
let _writeTimer: NodeJS.Timeout | null = null;

 

/**
 * 获取文件锁，防止并发写入冲突。
 * 使用锁文件机制，如果锁文件已存在则等待或超时。
 * @returns Promise<() => void> 返回一个释放锁的函数
 */
async function acquireLock(): Promise<() => void> {
  const startTime = Date.now();
  const lockData = {
    pid: process.pid,
    timestamp: startTime,
    timeout: LOCK_TIMEOUT
  };

  while (true) {
    try {
      // 尝试创建锁文件，使用 'wx' 标志确保文件不存在时才创建
      await fs.writeFile(LOCK_FILE_PATH, JSON.stringify(lockData, null, 2), { flag: 'wx' });
      devWithTimestamp(`[acquireLock] 成功获取文件锁: ${LOCK_FILE_PATH}`);
      
      // 返回释放锁的函数
      return async () => {
        try {
          await fs.unlink(LOCK_FILE_PATH);
          devWithTimestamp(`[releaseLock] 成功释放文件锁: ${LOCK_FILE_PATH}`);
        } catch (unlinkError) {
          devWithTimestamp(`[releaseLock] 释放文件锁失败: ${unlinkError}`);
        }
      };
    } catch (error: unknown) {
      // 如果锁文件已存在，检查是否为过期锁
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
        try {
          // 读取现有锁文件信息
          const existingLockData = JSON.parse(await fs.readFile(LOCK_FILE_PATH, 'utf-8'));
          const lockAge = Date.now() - existingLockData.timestamp;
          
          // 如果锁已过期，尝试删除过期锁
          if (lockAge > LOCK_TIMEOUT) {
            devWithTimestamp(`[acquireLock] 检测到过期锁文件，尝试清理: ${LOCK_FILE_PATH}`);
            try {
              await fs.unlink(LOCK_FILE_PATH);
              devWithTimestamp(`[acquireLock] 成功清理过期锁文件`);
              continue; // 重新尝试获取锁
            } catch (cleanupError) {
              devWithTimestamp(`[acquireLock] 清理过期锁文件失败: ${cleanupError}`);
            }
          }
        } catch (readError) {
          devWithTimestamp(`[acquireLock] 读取锁文件信息失败: ${readError}`);
        }
        
        // 检查是否超时
        if (Date.now() - startTime > LOCK_TIMEOUT) {
          throw new Error(`获取文件锁超时: ${LOCK_TIMEOUT}ms`);
        }
        
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200)); // 100-300ms 随机等待
      } else {
        throw error; // 其他错误直接抛出
      }
    }
  }
}

/**
 * 使用文件锁执行操作的包装函数。
 * @param operation 需要在锁保护下执行的操作
 * @returns 操作的返回值
 */
async function withFileLock<T>(operation: () => Promise<T>): Promise<T> {
  const releaseLock = await acquireLock();
  try {
    return await operation();
  } finally {
    await releaseLock();
  }
}


/**
 * 从缓存中获取指定电影番号的元数据。
 * 这是前端请求电影元数据时，后端首先会调用的函数。
 * @param code 电影番号。
 * @returns 对应的电影元数据，如果未找到则返回 null。
 */
export async function getCachedMovieMetadata(code: string, baseUrl: string): Promise<MovieMetadata | null> {
  // devWithTimestamp(`[getCachedMovieMetadata] 尝试获取番号 ${code} 的缓存（直接从磁盘读取）`);
  // 1. 直接从磁盘文件中查找（内存缓存已禁用）
  const cache = await readCache(); // 每次都从磁盘读取最新数据
  const found = cache.find(m => m.code === code);

  // 如果找到缓存条目，并且其 coverUrl 仍然是外部链接，则尝试本地化
  if (found && found.coverUrl && (found.coverUrl.startsWith('http://') || found.coverUrl.startsWith('https://'))) {
    // devWithTimestamp(`[getCachedMovieMetadata] 番号 ${code} 发现外部封面URL，尝试本地化: ${found.coverUrl}`);
    try {
      // 使用 baseUrl 构建完整的 image-proxy URL
      const proxyApiUrl = `${baseUrl}/api/image-proxy?url=${encodeURIComponent(found.coverUrl)}`;
      devWithTimestamp(`[getCachedMovieMetadata] 调用 image-proxy API URL: ${proxyApiUrl}`);
      const imageProxyResponse = await fetch(proxyApiUrl);
      if (imageProxyResponse.ok) {
        const proxyData = await imageProxyResponse.json();
        const localCoverUrl = proxyData.imageUrl;
        devWithTimestamp(`[getCachedMovieMetadata] 图片已通过 image-proxy 缓存到本地: ${localCoverUrl}`);
        
        // 更新找到的缓存条目，并写入磁盘
        found.coverUrl = localCoverUrl; 
        await updateMovieMetadataCache(found.code, found.coverUrl, found.title, found.actress); // 持久化更新
        // devWithTimestamp(`[getCachedMovieMetadata] 番号 ${code} 的封面URL已更新并持久化到本地`);
      } else {
        devWithTimestamp(`[getCachedMovieMetadata] 调用 image-proxy 失败: ${imageProxyResponse.statusText}`);
        // 如果代理失败，可以考虑使用默认图片或者保留原始URL，但不再尝试本地化
      }
    } catch (proxyError) {
      devWithTimestamp(`[getCachedMovieMetadata] 调用 image-proxy 发生错误: ${proxyError}`);
      // 发生错误时，将 found 设为 null 或者不修改 found.coverUrl，以便后续处理
    }
  }

  if (found) {
    // devWithTimestamp(`[getCachedMovieMetadata] 番号 ${code} 在缓存中找到`);
    return found;
  }
  // devWithTimestamp(`[getCachedMovieMetadata] 番号 ${code} 未在缓存中找到`);
  return null;
}

/**
 * 更新指定电影番号的元数据到缓存和磁盘文件。
 * 当从外部成功获取到电影元数据后，会调用此函数进行缓存更新。
 * @param code 电影番号。
 * @param coverUrl 封面图片URL。
 * @param title 电影标题。
 * @param actress 女优名字。
 * @param eloData 可选的Elo评分数据。
 */
export async function updateMovieMetadataCache(
  code: string, 
  coverUrl: string | null, 
  title: string | null, 
  actress: string | null,
  eloData?: {
    elo?: number;
    matchCount?: number;
    winCount?: number;
    drawCount?: number;
    lossCount?: number;
    lastRated?: number;
    recentMatches?: string[];
  }
) {
  devWithTimestamp(`[updateMovieMetadataCache] 添加番号 ${code} 到批量写入队列`);
  
  // 添加到批量写入队列
  const operation: WriteOperation = {
    code,
    coverUrl,
    title,
    actress,
    timestamp: Date.now(),
    // 添加Elo评分数据
    ...(eloData && {
      elo: eloData.elo,
      matchCount: eloData.matchCount,
      winCount: eloData.winCount,
      drawCount: eloData.drawCount,
      lossCount: eloData.lossCount,
      lastRated: eloData.lastRated,
      recentMatches: eloData.recentMatches
    })
  };
  
  // 移除队列中相同番号的旧操作（保留最新的）
  _writeQueue = _writeQueue.filter(op => op.code !== code);
  _writeQueue.push(operation);
  
  // 如果队列达到批量大小，立即执行写入
  if (_writeQueue.length >= WRITE_BATCH_SIZE) {
    devWithTimestamp(`[updateMovieMetadataCache] 队列达到批量大小 (${WRITE_BATCH_SIZE})，立即执行写入`);
    await flushWriteQueue();
  } else {
    // 否则设置定时器延迟写入
    if (_writeTimer) {
      clearTimeout(_writeTimer);
    }
    _writeTimer = setTimeout(async () => {
      await flushWriteQueue();
    }, WRITE_BATCH_DELAY);
    devWithTimestamp(`[updateMovieMetadataCache] 设置批量写入定时器，队列大小: ${_writeQueue.length}`);
  }
}

/**
 * 立即执行批量写入操作
 */
async function flushWriteQueue() {
  if (_writeQueue.length === 0) {
    return;
  }
  
  // 清除定时器
  if (_writeTimer) {
    clearTimeout(_writeTimer);
    _writeTimer = null;
  }
  
  const operationsToProcess = [..._writeQueue];
  _writeQueue = []; // 清空队列
  
  devWithTimestamp(`[flushWriteQueue] 开始批量写入 ${operationsToProcess.length} 个操作`);
  
  // 使用文件锁保护整个批量写入操作
  await withFileLock(async () => {
    // 1. 读取当前缓存
    const cache = await readCacheUnsafe();
    let modified = false;
    
    // 2. 批量应用所有操作
    for (const operation of operationsToProcess) {
      const { 
        code, coverUrl, title, actress, timestamp,
        elo, matchCount, winCount, drawCount, lossCount, lastRated, recentMatches
      } = operation;
      
      const existingIndex = cache.findIndex(m => m.code === code);
      if (existingIndex !== -1) {
        // 更新现有条目，保留现有数据并合并新数据
        const existing = cache[existingIndex];
        cache[existingIndex] = {
          code,
          coverUrl: coverUrl !== undefined ? coverUrl : existing.coverUrl,
          title: title !== undefined ? title : existing.title,
          actress: actress !== undefined ? actress : existing.actress,
          lastUpdated: timestamp,
          // 更新Elo评分数据
          elo: elo !== undefined ? elo : existing.elo,
          matchCount: matchCount !== undefined ? matchCount : existing.matchCount,
          winCount: winCount !== undefined ? winCount : existing.winCount,
          drawCount: drawCount !== undefined ? drawCount : existing.drawCount,
          lossCount: lossCount !== undefined ? lossCount : existing.lossCount,
          lastRated: lastRated !== undefined ? lastRated : existing.lastRated,
          recentMatches: recentMatches !== undefined ? recentMatches : existing.recentMatches
        };
        devWithTimestamp(`[flushWriteQueue] 批量更新现有缓存条目: ${code}`);
      } else {
        // 添加新条目到开头
        cache.unshift({
          code, coverUrl, title, actress, lastUpdated: timestamp,
          elo, matchCount, winCount, drawCount, lossCount, lastRated, recentMatches
        });
        devWithTimestamp(`[flushWriteQueue] 批量添加新缓存条目: ${code}`);
      }
      modified = true;
    }
    
    // 3. 如果有修改，写入磁盘
    if (modified) {
      await writeCacheUnsafe(cache);
      // 清除读取缓存，强制下次读取时重新加载
      // _readCache = null; // 移除此行
      devWithTimestamp(`[flushWriteQueue] 批量写入完成，共处理 ${operationsToProcess.length} 个操作`);
    }
  });
}

/**
 * 强制刷新写入队列（用于进程退出时确保数据不丢失）
 */
export async function forceFlushWriteQueue(): Promise<void> {
  if (_writeQueue.length > 0) {
    devWithTimestamp(`[forceFlushWriteQueue] 强制刷新写入队列，包含 ${_writeQueue.length} 个操作`);
    await flushWriteQueue();
  }
}

/**
 * 清除所有缓存（用于测试或重置）
 */
export function clearAllCaches(): void {
  // _readCache = null; // 内存缓存已禁用，但仍然清除以防万一 // 移除此行
  _writeQueue = [];
  if (_writeTimer) {
    clearTimeout(_writeTimer);
    _writeTimer = null;
  }
  devWithTimestamp('[clearAllCaches] 所有缓存已清除');
}

/**
 * 获取缓存统计信息
 */
export function getCacheStats() {
  return {
    readCacheActive: false, // 内存缓存已禁用
    readCacheAge: 0, // 内存缓存已禁用
    writeQueueSize: _writeQueue.length,
    writeTimerActive: _writeTimer !== null
  };
}


// 进程退出时的清理逻辑
process.on('beforeExit', async () => {
  devWithTimestamp('[movieMetadataCache] 进程即将退出，执行清理操作');
  await forceFlushWriteQueue();
});

process.on('SIGINT', async () => {
  devWithTimestamp('[movieMetadataCache] 收到 SIGINT 信号，执行清理操作');
  await forceFlushWriteQueue();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  devWithTimestamp('[movieMetadataCache] 收到 SIGTERM 信号，执行清理操作');
  await forceFlushWriteQueue();
  process.exit(0);
});


/**
 * 从磁盘读取电影元数据缓存文件。
 * 已禁用短期内存缓存，每次都从磁盘读取最新数据。
 * 读取前会先刷新写入队列，确保获取最新数据。
 * @returns 电影元数据数组。
 */
async function readCache(): Promise<MovieMetadata[]> {
  // devWithTimestamp('[readCache] 从磁盘读取最新数据（已禁用内存缓存）');
  
  // 在读取前先刷新写入队列，确保所有待写入的数据都已持久化
  if (_writeQueue.length > 0) {
    // devWithTimestamp(`[readCache] 检测到写入队列中有 ${_writeQueue.length} 个待写入操作，先刷新队列`);
    await flushWriteQueue();
  }
  
  // 从磁盘读取最新数据
  const data = await readCacheUnsafe();
  
  // 不再更新内存缓存
  // _readCache = null; // 确保不使用缓存
  
  return data;
}

/**
 * 从磁盘读取电影元数据缓存文件（不带锁的内部函数）。
 * 每次调用都直接从磁盘文件读取，不使用内存缓存。
 * 注意：此函数不使用文件锁，仅供内部在已获取锁的情况下使用。
 * 注意：内存缓存已禁用，每次都从磁盘读取最新数据。
 * @returns 电影元数据数组。
 */
async function readCacheUnsafe(): Promise<MovieMetadata[]> {
  // devWithTimestamp('[readCache] 从磁盘文件读取缓存数据');
  try {
    const cacheContent = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
    if (!cacheContent || cacheContent.trim() === '') {
      // 如果文件内容为空，返回空数组
      devWithTimestamp('[readCache] 缓存文件内容为空');
      return [];
    } else {
      // 解析 JSON 内容并返回
      try {
        const cache = JSON.parse(cacheContent);
        // devWithTimestamp(`[readCache] 从文件成功读取 ${cache.length} 条缓存记录`);
        return cache;
      } catch (parseError) {
        // JSON 解析失败，可能文件损坏
        devWithTimestamp('[readCache] JSON 解析失败，缓存文件可能损坏:', parseError);
        return [];
      }
    }
  } catch (error: unknown) {
    // 捕获文件操作中可能发生的错误
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      // 如果文件不存在，返回空数组
      // devWithTimestamp('[readCache] 缓存文件不存在');
      return [];
    } else {
      // 处理其他读取错误
      devWithTimestamp('[readCache] 读取缓存文件失败:', error);
      return [];
    }
  }
}

/**
 * 将电影元数据缓存写入磁盘文件（不带锁的内部函数）。
 * 此函数会进行原子性写入，确保数据完整性。
 * 注意：此函数不使用文件锁，仅供内部在已获取锁的情况下使用。
 * @param cache 要写入的电影元数据数组。
 */
async function writeCacheUnsafe(cache: MovieMetadata[]) {
  const startTime = Date.now();
  devWithTimestamp('[writeCache] 开始写入缓存到磁盘');
  
  // 写入前校验数据有效性，避免写入空数组或无效数据，防止覆盖掉有效数据
  if (!Array.isArray(cache) || cache.length === 0) {
    devWithTimestamp('[writeCache] 拒绝写入空缓存或无效数据，保留原有内容');
    return;
  }
  
  // 使用临时文件进行原子性写入，防止文件损坏
  const tmpFile = CACHE_FILE_PATH + '.tmp';
  
  // JSON 序列化：根据配置选择格式
  const jsonString = JSON.stringify(cache, null, JSON_PRETTY_FORMAT ? 2 : 0);
  const fileSizeKB = Math.round(Buffer.byteLength(jsonString, 'utf8') / 1024);
  const formatType = JSON_PRETTY_FORMAT ? '格式化' : '紧凑';
  
  try {
    // 1. 将数据写入临时文件
    devWithTimestamp(`[writeCache] 写入临时文件: ${tmpFile} (${fileSizeKB}KB, ${formatType}格式)`);
    await fs.writeFile(tmpFile, jsonString, 'utf-8');
    
    // 2. 将临时文件重命名为正式文件 (原子操作)
    devWithTimestamp(`[writeCache] 重命名临时文件到: ${CACHE_FILE_PATH}`);
    await fs.rename(tmpFile, CACHE_FILE_PATH);
    
    const duration = Date.now() - startTime;
    devWithTimestamp(`[writeCache] 缓存成功写入磁盘，共 ${cache.length} 条记录，耗时 ${duration}ms (${formatType}格式)`);
  } catch { // 修改这里，移除 _ 变量
    devWithTimestamp('[writeCache] 写入缓存文件失败:');
    // 尝试清理临时文件
    try {
      await fs.unlink(tmpFile);
    } catch { // 修改这里，移除 _ 变量
      // 忽略清理错误
    }
  }
}
