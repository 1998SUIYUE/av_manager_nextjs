import fs from 'fs/promises';
// import fsSync from 'fs'; // 移除此行
import path from 'path';
import { logWithTimestamp, warnWithTimestamp, errorWithTimestamp } from '@/utils/logger';

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

// 缓存文件在项目根目录的绝对路径
const CACHE_FILE_PATH = path.join(process.cwd(), 'movie-metadata-cache.json');
// 锁文件路径，用于防止并发写入冲突
const LOCK_FILE_PATH = CACHE_FILE_PATH + '.lock';
// 锁超时时间（毫秒），防止死锁
const LOCK_TIMEOUT = 30000; // 30秒

// 性能优化相关配置
// const READ_CACHE_TTL = 5000; // 读取缓存生存时间：5秒 // 移除此行
const WRITE_BATCH_DELAY = 1000; // 批量写入延迟：1秒
const WRITE_BATCH_SIZE = 10; // 批量写入大小：10个操作
const JSON_PRETTY_FORMAT = true; // JSON 格式化：true=可读性优先，false=性能优先

// 备份机制相关配置
const BACKUP_ENABLED = true; // 是否启用备份功能
const BACKUP_INTERVAL = 30 * 60 * 1000; // 备份间隔：30分钟
const MAX_BACKUP_COUNT = 10; // 最大备份文件数量
const BACKUP_DIR = path.join(process.cwd(), 'cache-backups'); // 备份目录
const BACKUP_ON_WRITE = true; // 每次写入时是否检查备份需求

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

// 备份相关变量
let _lastBackupTime = 0; // 上次备份时间
let _backupTimer: NodeJS.Timeout | null = null; // 定期备份定时器

// 备份文件信息接口
interface BackupInfo {
  filename: string;
  fullPath: string;
  timestamp: number;
  size: number;
} 

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
      logWithTimestamp(`[acquireLock] 成功获取文件锁: ${LOCK_FILE_PATH}`);
      
      // 返回释放锁的函数
      return async () => {
        try {
          await fs.unlink(LOCK_FILE_PATH);
          logWithTimestamp(`[releaseLock] 成功释放文件锁: ${LOCK_FILE_PATH}`);
        } catch (unlinkError) {
          warnWithTimestamp(`[releaseLock] 释放文件锁失败: ${unlinkError}`);
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
            warnWithTimestamp(`[acquireLock] 检测到过期锁文件，尝试清理: ${LOCK_FILE_PATH}`);
            try {
              await fs.unlink(LOCK_FILE_PATH);
              logWithTimestamp(`[acquireLock] 成功清理过期锁文件`);
              continue; // 重新尝试获取锁
            } catch (cleanupError) {
              warnWithTimestamp(`[acquireLock] 清理过期锁文件失败: ${cleanupError}`);
            }
          }
        } catch (readError) {
          warnWithTimestamp(`[acquireLock] 读取锁文件信息失败: ${readError}`);
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
 * 确保备份目录存在
 */
async function ensureBackupDir(): Promise<void> {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
  } catch (error) {
    errorWithTimestamp('[ensureBackupDir] 创建备份目录失败:', error);
  }
}

/**
 * 生成备份文件名
 */
function generateBackupFilename(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5); // 移除毫秒和时区
  return `movie-metadata-cache-${timestamp}.json`;
}

/**
 * 获取所有备份文件信息
 */
async function getBackupFiles(): Promise<BackupInfo[]> {
  try {
    await ensureBackupDir();
    const files = await fs.readdir(BACKUP_DIR);
    const backupFiles: BackupInfo[] = [];
    
    for (const file of files) {
      if (file.startsWith('movie-metadata-cache-') && file.endsWith('.json')) {
        const fullPath = path.join(BACKUP_DIR, file);
        try {
          const stat = await fs.stat(fullPath);
          backupFiles.push({
            filename: file,
            fullPath,
            timestamp: stat.mtimeMs,
            size: stat.size
          });
        } catch (statError) {
          warnWithTimestamp(`[getBackupFiles] 无法获取备份文件 ${file} 的信息:`, statError);
        }
      }
    }
    
    // 按时间戳降序排序（最新的在前）
    return backupFiles.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    errorWithTimestamp('[getBackupFiles] 获取备份文件列表失败:', error);
    return [];
  }
}

/**
 * 创建缓存文件备份
 */
async function createBackup(): Promise<boolean> {
  if (!BACKUP_ENABLED) {
    return false;
  }
  
  try {
    // 检查主缓存文件是否存在
    try {
      await fs.access(CACHE_FILE_PATH);
    } catch { // 修改这里，移除 error 变量
      logWithTimestamp('[createBackup] 主缓存文件不存在，跳过备份');
      return false;
    }
    
    await ensureBackupDir();
    
    const backupFilename = generateBackupFilename();
    const backupPath = path.join(BACKUP_DIR, backupFilename);
    
    // 复制主文件到备份目录
    await fs.copyFile(CACHE_FILE_PATH, backupPath);
    
    const stat = await fs.stat(backupPath);
    const sizeKB = Math.round(stat.size / 1024);
    
    logWithTimestamp(`[createBackup] 备份创建成功: ${backupFilename} (${sizeKB}KB)`);
    
    // 更新最后备份时间
    _lastBackupTime = Date.now();
    
    // 清理过期备份
    await cleanupOldBackups();
    
    return true;
  } catch (error) {
    errorWithTimestamp('[createBackup] 创建备份失败:', error);
    return false;
  }
}

/**
 * 清理过期的备份文件
 */
async function cleanupOldBackups(): Promise<void> {
  try {
    const backupFiles = await getBackupFiles();
    
    if (backupFiles.length <= MAX_BACKUP_COUNT) {
      return; // 备份数量未超限
    }
    
    // 删除超出数量限制的备份文件
    const filesToDelete = backupFiles.slice(MAX_BACKUP_COUNT);
    
    for (const backup of filesToDelete) {
      try {
        await fs.unlink(backup.fullPath);
        logWithTimestamp(`[cleanupOldBackups] 删除过期备份: ${backup.filename}`);
      } catch (deleteError) {
        warnWithTimestamp(`[cleanupOldBackups] 删除备份文件失败: ${backup.filename}`, deleteError);
      }
    }
    
    logWithTimestamp(`[cleanupOldBackups] 清理完成，删除了 ${filesToDelete.length} 个过期备份`);
  } catch (error) {
    errorWithTimestamp('[cleanupOldBackups] 清理备份文件失败:', error);
  }
}

/**
 * 从备份恢复缓存文件
 */
async function restoreFromBackup(): Promise<boolean> {
  try {
    const backupFiles = await getBackupFiles();
    
    if (backupFiles.length === 0) {
      warnWithTimestamp('[restoreFromBackup] 没有可用的备份文件');
      return false;
    }
    
    // 尝试从最新的备份恢复
    for (const backup of backupFiles) {
      try {
        // 验证备份文件是否有效
        const backupContent = await fs.readFile(backup.fullPath, 'utf-8');
        JSON.parse(backupContent); // 验证 JSON 格式
        
        // 复制备份文件到主文件位置
        await fs.copyFile(backup.fullPath, CACHE_FILE_PATH);
        
        logWithTimestamp(`[restoreFromBackup] 从备份恢复成功: ${backup.filename}`);
        
        // 清除读取缓存，强制重新加载
        // _readCache = null; // 移除此行
        
        return true;
      } catch (restoreError) {
        warnWithTimestamp(`[restoreFromBackup] 备份文件 ${backup.filename} 损坏，尝试下一个:`, restoreError);
        continue;
      }
    }
    
    errorWithTimestamp('[restoreFromBackup] 所有备份文件都无法使用');
    return false;
  } catch (error) {
    errorWithTimestamp('[restoreFromBackup] 恢复备份失败:', error);
    return false;
  }
}

/**
 * 检查是否需要创建备份
 */
async function checkBackupNeeded(): Promise<void> {
  if (!BACKUP_ENABLED) {
    return;
  }
  
  const now = Date.now();
  const timeSinceLastBackup = now - _lastBackupTime;
  
  if (timeSinceLastBackup >= BACKUP_INTERVAL) {
    logWithTimestamp(`[checkBackupNeeded] 距离上次备份已过 ${Math.round(timeSinceLastBackup / 60000)} 分钟，创建新备份`);
    await createBackup();
  }
}

/**
 * 从缓存中获取指定电影番号的元数据。
 * 这是前端请求电影元数据时，后端首先会调用的函数。
 * @param code 电影番号。
 * @returns 对应的电影元数据，如果未找到则返回 null。
 */
export async function getCachedMovieMetadata(code: string, baseUrl: string): Promise<MovieMetadata | null> {
  // logWithTimestamp(`[getCachedMovieMetadata] 尝试获取番号 ${code} 的缓存（直接从磁盘读取）`);
  // 1. 直接从磁盘文件中查找（内存缓存已禁用）
  const cache = await readCache(); // 每次都从磁盘读取最新数据
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
    // logWithTimestamp(`[getCachedMovieMetadata] 番号 ${code} 在缓存中找到`);
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
  logWithTimestamp(`[updateMovieMetadataCache] 添加番号 ${code} 到批量写入队列`);
  
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
    logWithTimestamp(`[updateMovieMetadataCache] 队列达到批量大小 (${WRITE_BATCH_SIZE})，立即执行写入`);
    await flushWriteQueue();
  } else {
    // 否则设置定时器延迟写入
    if (_writeTimer) {
      clearTimeout(_writeTimer);
    }
    _writeTimer = setTimeout(async () => {
      await flushWriteQueue();
    }, WRITE_BATCH_DELAY);
    logWithTimestamp(`[updateMovieMetadataCache] 设置批量写入定时器，队列大小: ${_writeQueue.length}`);
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
  
  logWithTimestamp(`[flushWriteQueue] 开始批量写入 ${operationsToProcess.length} 个操作`);
  
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
        logWithTimestamp(`[flushWriteQueue] 批量更新现有缓存条目: ${code}`);
      } else {
        // 添加新条目到开头
        cache.unshift({
          code, coverUrl, title, actress, lastUpdated: timestamp,
          elo, matchCount, winCount, drawCount, lossCount, lastRated, recentMatches
        });
        logWithTimestamp(`[flushWriteQueue] 批量添加新缓存条目: ${code}`);
      }
      modified = true;
    }
    
    // 3. 如果有修改，写入磁盘
    if (modified) {
      await writeCacheUnsafe(cache);
      // 清除读取缓存，强制下次读取时重新加载
      // _readCache = null; // 移除此行
      logWithTimestamp(`[flushWriteQueue] 批量写入完成，共处理 ${operationsToProcess.length} 个操作`);
    }
  });
}

/**
 * 强制刷新写入队列（用于进程退出时确保数据不丢失）
 */
export async function forceFlushWriteQueue(): Promise<void> {
  if (_writeQueue.length > 0) {
    logWithTimestamp(`[forceFlushWriteQueue] 强制刷新写入队列，包含 ${_writeQueue.length} 个操作`);
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
  logWithTimestamp('[clearAllCaches] 所有缓存已清除');
}

/**
 * 获取缓存统计信息
 */
export function getCacheStats() {
  return {
    readCacheActive: false, // 内存缓存已禁用
    readCacheAge: 0, // 内存缓存已禁用
    writeQueueSize: _writeQueue.length,
    writeTimerActive: _writeTimer !== null,
    lastBackupTime: _lastBackupTime,
    timeSinceLastBackup: _lastBackupTime ? Date.now() - _lastBackupTime : 0,
    backupEnabled: BACKUP_ENABLED
  };
}

/**
 * 手动创建备份
 */
export async function createManualBackup(): Promise<boolean> {
  logWithTimestamp('[createManualBackup] 手动创建备份');
  return await createBackup();
}

/**
 * 获取备份文件列表
 */
export async function getBackupList(): Promise<BackupInfo[]> {
  return await getBackupFiles();
}

/**
 * 手动从备份恢复
 */
export async function restoreFromBackupManual(backupFilename?: string): Promise<boolean> {
  if (backupFilename) {
    // 从指定备份恢复
    try {
      const backupPath = path.join(BACKUP_DIR, backupFilename);
      
      // 验证备份文件
      const backupContent = await fs.readFile(backupPath, 'utf-8');
      JSON.parse(backupContent); // 验证 JSON 格式
      
      // 复制到主文件
      await fs.copyFile(backupPath, CACHE_FILE_PATH);
      
      // 清除读取缓存
      // _readCache = null; // 移除此行
      
      logWithTimestamp(`[restoreFromBackupManual] 从指定备份恢复成功: ${backupFilename}`);
      return true;
    } catch (error) {
      errorWithTimestamp(`[restoreFromBackupManual] 从指定备份恢复失败: ${backupFilename}`, error);
      return false;
    }
  } else {
    // 从最新备份恢复
    return await restoreFromBackup();
  }
}

/**
 * 清理所有备份文件
 */
export async function clearAllBackups(): Promise<number> {
  try {
    const backupFiles = await getBackupFiles();
    let deletedCount = 0;
    
    for (const backup of backupFiles) {
      try {
        await fs.unlink(backup.fullPath);
        deletedCount++;
        logWithTimestamp(`[clearAllBackups] 删除备份: ${backup.filename}`);
      } catch (deleteError) {
        warnWithTimestamp(`[clearAllBackups] 删除备份失败: ${backup.filename}`, deleteError);
      }
    }
    
    logWithTimestamp(`[clearAllBackups] 清理完成，删除了 ${deletedCount} 个备份文件`);
    return deletedCount;
  } catch (error) {
    errorWithTimestamp('[clearAllBackups] 清理备份失败:', error);
    return 0;
  }
}

// 进程退出时的清理逻辑
process.on('beforeExit', async () => {
  logWithTimestamp('[movieMetadataCache] 进程即将退出，执行清理操作');
  await forceFlushWriteQueue();
});

process.on('SIGINT', async () => {
  logWithTimestamp('[movieMetadataCache] 收到 SIGINT 信号，执行清理操作');
  await forceFlushWriteQueue();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logWithTimestamp('[movieMetadataCache] 收到 SIGTERM 信号，执行清理操作');
  await forceFlushWriteQueue();
  if (_backupTimer) {
    clearInterval(_backupTimer);
  }
  process.exit(0);
});

// 初始化定期备份
if (BACKUP_ENABLED) {
  // 启动时创建一次备份
  setTimeout(async () => {
    logWithTimestamp('[movieMetadataCache] 启动时创建初始备份');
    await createBackup();
  }, 5000); // 延迟5秒，等待系统稳定
  
  // 设置定期备份定时器
  _backupTimer = setInterval(async () => {
    logWithTimestamp('[movieMetadataCache] 定期备份检查');
    await checkBackupNeeded();
  }, BACKUP_INTERVAL);
  
  logWithTimestamp(`[movieMetadataCache] 备份系统已启用，间隔: ${BACKUP_INTERVAL / 60000} 分钟，最大备份数: ${MAX_BACKUP_COUNT}`);
}

/**
 * 从磁盘读取电影元数据缓存文件。
 * 已禁用短期内存缓存，每次都从磁盘读取最新数据。
 * 读取前会先刷新写入队列，确保获取最新数据。
 * @returns 电影元数据数组。
 */
async function readCache(): Promise<MovieMetadata[]> {
  // logWithTimestamp('[readCache] 从磁盘读取最新数据（已禁用内存缓存）');
  
  // 在读取前先刷新写入队列，确保所有待写入的数据都已持久化
  if (_writeQueue.length > 0) {
    logWithTimestamp(`[readCache] 检测到写入队列中有 ${_writeQueue.length} 个待写入操作，先刷新队列`);
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
  // logWithTimestamp('[readCache] 从磁盘文件读取缓存数据');
  try {
    const cacheContent = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
    if (!cacheContent || cacheContent.trim() === '') {
      // 如果文件内容为空，尝试从备份恢复
      logWithTimestamp('[readCache] 缓存文件内容为空，尝试从备份恢复');
      const restored = await restoreFromBackup();
      if (restored) {
        // 恢复成功，重新读取
        return await readCacheUnsafe();
      }
      return [];
    } else {
      // 解析 JSON 内容并返回
      try {
        const cache = JSON.parse(cacheContent);
        // logWithTimestamp(`[readCache] 从文件成功读取 ${cache.length} 条缓存记录`);
        return cache;
      } catch (parseError) {
        // JSON 解析失败，可能文件损坏，尝试从备份恢复
        errorWithTimestamp('[readCache] JSON 解析失败，缓存文件可能损坏，尝试从备份恢复:', parseError);
        const restored = await restoreFromBackup();
        if (restored) {
          // 恢复成功，重新读取
          return await readCacheUnsafe();
        }
        return [];
      }
    }
  } catch (error: unknown) {
    // 捕获文件操作中可能发生的错误
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      // 如果文件不存在，尝试从备份恢复
      logWithTimestamp('[readCache] 缓存文件不存在，尝试从备份恢复');
      const restored = await restoreFromBackup();
      if (restored) {
        // 恢复成功，重新读取
        return await readCacheUnsafe();
      }
      return [];
    } else {
      // 处理其他读取错误，尝试从备份恢复
      errorWithTimestamp('[readCache] 读取缓存文件失败，尝试从备份恢复:', error);
      const restored = await restoreFromBackup();
      if (restored) {
        // 恢复成功，重新读取
        return await readCacheUnsafe();
      }
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
  logWithTimestamp('[writeCache] 开始写入缓存到磁盘');
  
  // 写入前校验数据有效性，避免写入空数组或无效数据，防止覆盖掉有效数据
  if (!Array.isArray(cache) || cache.length === 0) {
    warnWithTimestamp('[writeCache] 拒绝写入空缓存或无效数据，保留原有内容');
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
    logWithTimestamp(`[writeCache] 写入临时文件: ${tmpFile} (${fileSizeKB}KB, ${formatType}格式)`);
    await fs.writeFile(tmpFile, jsonString, 'utf-8');
    
    // 2. 将临时文件重命名为正式文件 (原子操作)
    logWithTimestamp(`[writeCache] 重命名临时文件到: ${CACHE_FILE_PATH}`);
    await fs.rename(tmpFile, CACHE_FILE_PATH);
    
    const duration = Date.now() - startTime;
    logWithTimestamp(`[writeCache] 缓存成功写入磁盘，共 ${cache.length} 条记录，耗时 ${duration}ms (${formatType}格式)`);
    
    // 写入成功后检查是否需要备份
    if (BACKUP_ON_WRITE) {
      await checkBackupNeeded();
    }
  } catch { // 修改这里，移除 _ 变量
    errorWithTimestamp('[writeCache] 写入缓存文件失败:');
    // 尝试清理临时文件
    try {
      await fs.unlink(tmpFile);
    } catch { // 修改这里，移除 _ 变量
      // 忽略清理错误
    }
  }
}
