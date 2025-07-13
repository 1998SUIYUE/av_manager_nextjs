import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";
import {
  getCachedMovieMetadata,
  updateMovieMetadataCache,
} from "@/lib/movieMetadataCache";
import { writeFile, readFile } from "fs/promises";
import { devWithTimestamp } from "@/utils/logger";

// 支持的视频文件扩展名列表
const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".webm"];

// 文件大小阈值：只处理大于此大小的视频文件 (100MB = 100 * 1024 * 1024 字节)
const FILE_SIZE_THRESHOLD = 100 * 1024 * 1024;

// 定义电影文件接口
interface MovieFile {
  filename: string;
  path: string;
  absolutePath: string;
  size: number;
  sizeInGB: number;
  extension: string;
  title: string;
  displayTitle?: string;
  year?: string;
  modifiedAt: number;
  code?: string;
  coverUrl?: string | null;
  actress?: string | null;
}

/**
 * 解析电影文件名
 */
function parseMovieFilename(filename: string): {
  title: string;
  year?: string;
  code?: string;
} {
  const nameWithoutExt = path.basename(filename, path.extname(filename));
  const matchResult = nameWithoutExt.match(/([a-zA-Z]{2,5}-\d{2,5})/i);
  let title = nameWithoutExt;
  let code: string | undefined;

  if (matchResult) {
    code = matchResult[1].toUpperCase();
    if (title.toLowerCase().startsWith(code.toLowerCase())) {
      title = title.substring(code.length).trim();
      if (title.startsWith('-') || title.startsWith('_')) {
        title = title.substring(1).trim();
      }
    }
  }

  return {
    title: title,
    year: (nameWithoutExt.match(/\b(19\d{2}|20\d{2})\b/) || [])[0],
    code: code,
  };
}

/**
 * 使用 axios 和 cheerio 获取元数据，替代 Playwright
 */
async function fetchCoverUrl(code: string, baseUrl: string) {
  // 1. 检查缓存
  const cachedMetadata = await getCachedMovieMetadata(code, baseUrl);
  if (cachedMetadata && cachedMetadata.coverUrl && cachedMetadata.title) {
    return cachedMetadata;
  }
  if (cachedMetadata) {
    devWithTimestamp(`[fetchCoverUrl] 番号 ${code} 在缓存中找到，但信息不完整，将从网络获取`);
  }

  devWithTimestamp(`[fetchCoverUrl] 开始使用 axios 获取 ${code} 的元数据`);

  try {
    // 2. 发送 HTTP 请求获取搜索结果页面
    const searchUrl = `https://javdb.com/search?q=${code}&f=all`;
    const searchResponse = await axios.get(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      timeout: 8000,
    });

    const $search = cheerio.load(searchResponse.data);
    const moviePageLink = $search("div.movie-list > div.item > a").first().attr("href");

    if (!moviePageLink) {
      throw new Error(`在搜索结果中未找到番号 ${code} 的链接`);
    }

    const moviePageUrl = `https://javdb.com${moviePageLink}`;
    devWithTimestamp(`[fetchCoverUrl] 找到详情页链接: ${moviePageUrl}`);

    // 3. 请求电影详情页
    const pageResponse = await axios.get(moviePageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      timeout: 8000,
    });
    const $page = cheerio.load(pageResponse.data);

    // 4. 解析页面内容
    let coverUrl = $page("div.column-video-cover img").attr("src") || null;
    const title = $page("h2 > strong.current-title").text().trim() || null;
    const actress = $page('strong:contains("演員:")').nextAll("span.value").first().text().trim() || "unknow";

    // 5. 处理封面图片代理
    if (coverUrl) {
      devWithTimestamp(`[fetchCoverUrl] 原始封面URL: ${coverUrl}`);
      try {
        const proxyApiUrl = `${baseUrl}/api/image-proxy?url=${encodeURIComponent(coverUrl)}`;
        const imageProxyResponse = await fetch(proxyApiUrl);
        if (imageProxyResponse.ok) {
          const proxyData = await imageProxyResponse.json();
          coverUrl = proxyData.imageUrl; // 更新为本地代理URL
          devWithTimestamp(`[fetchCoverUrl] 封面已通过 image-proxy 缓存到本地: ${coverUrl}`);
        } else {
           devWithTimestamp(`[fetchCoverUrl] 调用 image-proxy 失败: ${imageProxyResponse.statusText}`);
        }
      } catch (proxyError) {
        devWithTimestamp(`[fetchCoverUrl] 调用 image-proxy 发生错误: ${proxyError}`);
      }
    }

    // 6. 更新缓存并返回结果
    if (coverUrl || title || actress) {
      devWithTimestamp(`[fetchCoverUrl] 番号 ${code} 处理完成 - 封面: ${coverUrl}, 标题: ${title}, 女优: ${actress}`);
      await updateMovieMetadataCache(code, coverUrl, title, actress);
    } else {
      devWithTimestamp(`[fetchCoverUrl] 番号 ${code} 处理失败 - 未获取到任何元数据`);
    }

    return { coverUrl, title, actress };

  } catch (error) {
    devWithTimestamp(`[fetchCoverUrl] 获取 ${code} 信息时发生错误:`, error);
    
    // 错误处理和备用封面逻辑
    const backupCoverUrl = `https://fourhoi.com/${code.toLocaleLowerCase()}/cover-n.jpg`;
    devWithTimestamp(`[fetchCoverUrl] 尝试使用备用封面URL: ${backupCoverUrl}`);
    
    try {
      const proxyApiUrl = `${baseUrl}/api/image-proxy?url=${encodeURIComponent(backupCoverUrl)}`;
      const imageProxyResponse = await fetch(proxyApiUrl);
      if (imageProxyResponse.ok) {
        const proxyData = await imageProxyResponse.json();
        const localCoverUrl = proxyData.imageUrl;
        devWithTimestamp(`[fetchCoverUrl] 备用封面已缓存到本地: ${localCoverUrl}`);
        await updateMovieMetadataCache(code, localCoverUrl, null, null);
        return { coverUrl: localCoverUrl, title: null, actress: null };
      }
    } catch (proxyError) {
      devWithTimestamp(`[fetchCoverUrl] 缓存备用封面失败:`, proxyError);
    }
    
    return { coverUrl: null, title: null, actress: null };
  }
}

/**
 * 处理扫描到的电影文件列表，获取其封面信息并检测重复文件。
 * @param movieFiles 扫描到的原始电影文件数组。
 * @param baseUrl 当前请求的基础URL，用于构建image-proxy的绝对路径。
 * @returns 包含封面信息和去重后的电影文件数组。
 */
async function processMovieFiles(movieFiles: MovieFile[], baseUrl: string) {
  const startTime = Date.now(); // 开始计时
  
  // 内存监控函数
  function checkMemoryUsage() {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const rssMB = memUsage.rss / 1024 / 1024;
    
    devWithTimestamp(`[processMovieFiles] 内存使用 - Heap: ${heapUsedMB.toFixed(2)}MB, RSS: ${rssMB.toFixed(2)}MB`);
    
    // 如果内存使用超过800MB，触发垃圾回收
    if (rssMB > 800) {
      devWithTimestamp(`[processMovieFiles] 警告: 内存使用过高 (${rssMB.toFixed(2)}MB)，触发垃圾回收`);
      if (global.gc) {
        global.gc();
      }
      return false; // 返回false表示内存压力大
    }
    return true;
  }

  // 根据文件最后修改时间降序排序电影文件 (最新的在前)
  const sortedMovies = movieFiles.sort((a, b) => b.modifiedAt - a.modifiedAt);

  // 限制处理文件数量，避免一次性处理过多文件导致系统崩溃
  const maxFilesToProcess = 30; // 进一步减少到30个文件
  const limitedMovies = sortedMovies.slice(0, maxFilesToProcess);
  
  if (sortedMovies.length > maxFilesToProcess) {
    devWithTimestamp(`[processMovieFiles] 警告: 发现 ${sortedMovies.length} 个文件，但只处理前 ${maxFilesToProcess} 个以避免系统过载`);
  }

  // 使用信号量 (Semaphore) 控制并发的网络请求数量，避免同时发送过多请求
  const concurrencyLimit = 3; // 设置为3，以降低被屏蔽风险
  const semaphore = new Semaphore(concurrencyLimit);
  
  // 启动内存监控
  const memoryCheckInterval = setInterval(checkMemoryUsage, 5000);
  
  // 批处理大小
  const batchSize = 5;

  // 分批处理电影文件，避免一次性处理过多导致内存溢出
  const processedMovies: MovieFile[] = [];
  
  // 预先检查缓存，分离需要网络请求的文件
  const cachedMovies: MovieFile[] = [];
  const needsFetchMovies: MovieFile[] = [];
  
  for (const movie of limitedMovies) {
    if (movie.code) {
      try {
        const cachedMetadata = await getCachedMovieMetadata(movie.code, baseUrl);
        if (cachedMetadata && cachedMetadata.coverUrl && cachedMetadata.title) {
          // 有完整缓存，直接添加到结果
          const eloData = cachedMetadata.elo !== undefined ? {
            elo: cachedMetadata.elo,
            matchCount: cachedMetadata.matchCount || 0,
            winCount: cachedMetadata.winCount || 0,
            drawCount: cachedMetadata.drawCount || 0,
            lossCount: cachedMetadata.lossCount || 0,
            winRate: cachedMetadata.matchCount ? 
              (cachedMetadata.winCount || 0) / cachedMetadata.matchCount : 0
          } : {};
          
          cachedMovies.push({
            ...movie,
            coverUrl: cachedMetadata.coverUrl,
            displayTitle: cachedMetadata.title,
            actress: cachedMetadata.actress,
            ...eloData
          });
        } else {
          needsFetchMovies.push(movie);
        }
      } catch {
        needsFetchMovies.push(movie);
      }
    } else {
      cachedMovies.push(movie); // 没有番号的直接添加
    }
  }
  
  devWithTimestamp(`[processMovieFiles] 🚀 性能优化: 缓存命中 ${cachedMovies.length}个, 需要网络获取 ${needsFetchMovies.length}个 (节省 ${Math.round((cachedMovies.length / limitedMovies.length) * 100)}% 网络请求)`);
  
  // 先添加缓存的电影
  processedMovies.push(...cachedMovies);
  
  try {
    // 只处理需要网络请求的文件
    for (let i = 0; i < needsFetchMovies.length; i += batchSize) {
      const batch = needsFetchMovies.slice(i, i + batchSize);
      devWithTimestamp(`[processMovieFiles] 处理网络请求批次 ${Math.floor(i/batchSize) + 1}/${Math.ceil(needsFetchMovies.length/batchSize)}, 文件数: ${batch.length}`);
      
      // 检查内存使用情况
      if (!checkMemoryUsage()) {
        devWithTimestamp(`[processMovieFiles] 内存压力过大，暂停处理`);
        break;
      }
      
      // 处理当前批次
      const batchResults = await Promise.allSettled(
        batch.map(async (movie) => {
          // 在发送网络请求前，先通过信号量获取许可，控制并发
          return semaphore.acquire().then(async (release) => {
            try {
              let coverUrl = null;
              let title = null;
              let actress = null;
              // 如果电影文件有番号，则尝试获取其封面和标题
              if (movie.code) {
                try {
                  const result = await retryWithTimeout(
                    () => fetchCoverUrl(movie.code!, baseUrl),
                    2, // 重试2次
                    10000 // 10秒超时
                  );
                  coverUrl = result.coverUrl;
                  title = result.title;
                  actress = result.actress;
                } catch (error) {
                  devWithTimestamp(`处理电影 ${movie.filename} 时发生错误:`, error);
                }
              }

              // 获取评分数据
              let eloData = null;
              if (movie.code) {
                try {
                  const cachedMetadata = await getCachedMovieMetadata(movie.code, baseUrl);
                  if (cachedMetadata && cachedMetadata.elo !== undefined) {
                    eloData = {
                      elo: cachedMetadata.elo,
                      matchCount: cachedMetadata.matchCount || 0,
                      winCount: cachedMetadata.winCount || 0,
                      drawCount: cachedMetadata.drawCount || 0,
                      lossCount: cachedMetadata.lossCount || 0,
                      winRate: cachedMetadata.matchCount ? 
                        (cachedMetadata.winCount || 0) / cachedMetadata.matchCount : 0
                    };
                  }
                } catch{
                  // 忽略评分数据获取错误
                }
              }

              // 返回包含所有元数据（包括新获取的封面、标题、女优、评分）的电影对象
              return {
                ...movie,
                coverUrl,
                displayTitle: title || movie.title,
                actress,
                ...(eloData && {
                  elo: eloData.elo,
                  matchCount: eloData.matchCount,
                  winCount: eloData.winCount,
                  drawCount: eloData.drawCount,
                  lossCount: eloData.lossCount,
                  winRate: eloData.winRate
                })
              };
            } finally {
              release(); // 释放信号量，允许下一个请求执行
            }
          });
        })
      );
      
      // 收集成功的结果
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          processedMovies.push(result.value);
        } else {
          devWithTimestamp(`[processMovieFiles] 处理失败:`, result.reason);
          processedMovies.push(batch[index]); // 添加原始数据作为后备
        }
      });
      
      // 批次间延迟，给系统喘息时间
      if (i + batchSize < needsFetchMovies.length) {
        devWithTimestamp(`[processMovieFiles] 批次处理完成，延迟1秒...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } finally {
    // 清理内存监控
    clearInterval(memoryCheckInterval);
  }

  // 检测并记录重复的电影文件 (基于电影番号)
  const duplicateMovies: MovieFile[] = [];
  const seenPaths = new Set<string>(); // 用于存储已处理过的电影番号 (小写)

  movieFiles.forEach((movie) => {
    if (movie.code) {
      if (seenPaths.has(movie.code.toLocaleLowerCase())) {
        duplicateMovies.push(movie);
      } else {
        seenPaths.add(movie.code.toLocaleLowerCase());
      }
    }
  });
  
  // 打印重复文件信息
  if (duplicateMovies.length > 0) {
    console.log("检测到重复文件:");
    duplicateMovies.forEach((movie) => {
      console.log(`重复文件: \n  - 文件名: ${movie.filename}\n  - 路径: ${movie.path}\n  - 大小: ${movie.sizeInGB}GB;\n`);
    });
    console.log(`总共检测到 ${duplicateMovies.length} 个重复文件`);
  } else {
    console.log("没有检测到重复文件");
  }
  // 性能统计
  const endTime = Date.now();
  const totalTime = (endTime - startTime) / 1000; // 转换为秒
  const avgTimePerMovie = totalTime / processedMovies.length;
  
  devWithTimestamp(`[processMovieFiles] 🎯 性能统计:`);
  devWithTimestamp(`  ⏱️  总处理时间: ${totalTime.toFixed(2)}秒`);
  devWithTimestamp(`  📊 处理文件数: ${processedMovies.length}个`);
  devWithTimestamp(`  ⚡ 平均每个文件: ${avgTimePerMovie.toFixed(2)}秒`);
  devWithTimestamp(`  💾 缓存命中率: ${Math.round((cachedMovies.length / limitedMovies.length) * 100)}%`);
  devWithTimestamp(`  🌐 网络请求数: ${needsFetchMovies.length}个`);
  
  console.log(
    "项目路径: https://localhost:3000"
  );
  return processedMovies;
}

/**
 * 信号量类，用于控制异步操作的并发数量。
 * @param permits 允许同时进行的并发操作数量。
 */
class Semaphore {
  private permits: number; // 当前可用的许可数量
  private queue: Array<() => void>; // 等待获取许可的 Promise 队列

  constructor(permits: number) {
    this.permits = permits;
    this.queue = [];
  }

  /**
   * 尝试获取一个许可。如果当前没有可用许可，则将请求加入队列等待。
   * @returns 一个 Promise，在获取到许可后 resolve 一个释放函数。
   */
  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      // 释放函数，用于在操作完成后归还许可
      const release = () => {
        this.permits++; // 归还一个许可
        this.checkQueue(); // 检查队列中是否有等待的请求
      };

      if (this.permits > 0) {
        this.permits--; // 消耗一个许可
        resolve(release); // 立即解决 Promise 并提供释放函数
      } else {
        // 如果没有可用许可，将当前请求的 resolve 函数加入队列
        this.queue.push(() => {
          this.permits--; // 获取许可
          resolve(release); // 解决 Promise
        });
      }
    });
  }

  /**
   * 检查队列并执行等待中的请求（如果有可用许可）。
   */
  private checkQueue() {
    try {
      // 如果队列中有等待的请求且有可用许可，则执行队列中的下一个请求
      if (this.queue.length > 0 && this.permits > 0) {
        const next = this.queue.shift(); // 取出队列中的第一个请求
        if (next) {
          next(); // 执行请求
        } else {
          devWithTimestamp("checkQueue: Retrieved null or undefined from queue");
        }
      }
    } catch (error) {
      devWithTimestamp("checkQueue: Error occurred while processing queue", error);
    }
  }
}

/**
 * 带重试和超时的函数装饰器。
 * @param fn 要执行的异步函数。
 * @param maxRetries 最大重试次数 (默认: 3)。
 * @param timeout 每次尝试的超时时间 (毫秒，默认: 10000)。
 * @returns 原始函数的 Promise 结果。
 * @throws 如果所有重试都失败，则抛出最后一个错误。
 */
async function retryWithTimeout<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  timeout: number = 10000
): Promise<T> {
  let lastError: Error | null = null;

  // 循环进行重试
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 使用 Promise.race 实现超时逻辑：fn() 和一个超时 Promise 竞争
      return await Promise.race([
        fn(),
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error("操作超时")), timeout)
        ),
      ]);
    } catch (error) {
      devWithTimestamp(`第 ${attempt} 次尝试失败:`, error);
      lastError = error as Error;

      // 指数退避策略：每次重试增加等待时间，以避免连续失败
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * Math.pow(2, attempt))
      );
    }
  }

  // 所有重试尝试均失败，抛出最后一个错误
  throw lastError || new Error("所有重试尝试均失败");
}

/**
 * 遍历指定目录下的所有文件，找到满足条件的视频文件，提取视频文件的元数据。
 * @param directoryPath 目录的绝对路径。
 * @returns 一个 Promise，resolve 时携带一个 MovieFile 数组。
 */
async function scanMovieDirectory(directoryPath: string, baseUrl: string) {
  devWithTimestamp(`[scanMovieDirectory] 开始扫描目录: ${directoryPath}`);
  // 处理路径中的引号和反斜杠，确保路径格式正确
  const cleanPath = directoryPath.replace(/['"]/g, "").replace(/\\/g, "/");
  devWithTimestamp("[scanMovieDirectory] 清理后的路径:", cleanPath);
  const movieFiles: MovieFile[] = []; // 用于存储扫描到的电影文件信息

  /**
   * 递归遍历目录的内部函数。
   * @param currentPath 当前要扫描的目录的绝对路径。
   */
  async function scanDirectory(currentPath: string) {
    devWithTimestamp(`[scanDirectory] 开始扫描子目录: ${currentPath}`);

    // 规范化当前路径，确保跨平台兼容性
    const normalizedPath = path.normalize(currentPath);

    try {
      // 读取当前目录的内容 (文件和子目录)
      devWithTimestamp(`[scanDirectory] 读取目录内容: ${normalizedPath}`);
      const files = await fs.promises.readdir(normalizedPath);
      devWithTimestamp(`[scanDirectory] 目录 ${normalizedPath} 中发现 ${files.length} 个条目`);

      // 遍历目录中的每个条目
      for (const file of files) {
        const fullPath = path.join(normalizedPath, file);
        // devWithTimestamp(`[scanDirectory] 处理文件/目录: ${fullPath}`);

        try {
          // 获取文件或目录的统计信息 (例如：是否是目录，文件大小，修改时间等)
          // devWithTimestamp(`[scanDirectory] 获取文件/目录 stat: ${fullPath}`);
          const stats = await fs.promises.stat(fullPath);
          // devWithTimestamp(`[scanDirectory] 完成 stat: ${fullPath}, isDirectory: ${stats.isDirectory()}`);

          if (stats.isDirectory()) {
            // 如果是目录，则递归调用自身，继续扫描子目录
            devWithTimestamp(`[scanDirectory] 发现子目录，开始递归扫描: ${fullPath}`);
            await scanDirectory(fullPath);
          } else {
            // 如果是文件，则检查其是否为视频文件且大小符合要求
            // console.log(`发现文件 ${fullPath}`);

            const ext = path.extname(file).toLowerCase(); // 获取文件扩展名并转为小写
            // 检查文件扩展名是否在支持的视频扩展名列表中，并且文件大小是否大于阈值
            if (
              VIDEO_EXTENSIONS.includes(ext) &&
              stats.size >= FILE_SIZE_THRESHOLD
            ) {
              devWithTimestamp(`[scanDirectory] 发现符合条件的视频文件: ${file} (大小: ${(stats.size / (1024 * 1024 * 1024)).toFixed(2)}GB)`);
              // 解析电影文件名以提取元数据
              const parsedInfo = parseMovieFilename(file);
              // 构建 MovieFile 对象
              const movieFile: MovieFile = {
                filename: file,
                path: fullPath,
                absolutePath: path.resolve(fullPath),
                size: stats.size,
                sizeInGB: Number(
                  (stats.size / (1024 * 1024 * 1024)).toFixed(2)
                ),
                extension: ext,
                title: parsedInfo.title,
                year: parsedInfo.year,
                code: parsedInfo.code,
                modifiedAt: stats.mtimeMs,
              };

              // console.log(
              //   `大文件: ${movieFile.filename} - ${movieFile.sizeInGB}GB, 标题: ${movieFile.title}`
              // );

              movieFiles.push(movieFile); // 将电影文件添加到列表中
              devWithTimestamp(`[scanDirectory] 添加电影文件到列表: ${movieFile.filename}`);
            } else {
              // 记录跳过的文件及原因
              if (!VIDEO_EXTENSIONS.includes(ext)) {
                devWithTimestamp(`[scanDirectory] 跳过文件 (不支持的格式): ${file} (扩展名: ${ext})`);
              } else if (stats.size < FILE_SIZE_THRESHOLD) {
                devWithTimestamp(`[scanDirectory] 跳过文件 (文件太小): ${file} (大小: ${(stats.size / (1024 * 1024 * 1024)).toFixed(2)}GB, 阈值: ${(FILE_SIZE_THRESHOLD / (1024 * 1024 * 1024)).toFixed(2)}GB)`);
              }
            }
          }
        } catch (fileError) {
          devWithTimestamp(`[scanDirectory] 处理文件 ${file} 时发生错误:`, fileError); // 记录处理单个文件时的错误
        }
      }
    } catch (dirError) {
      devWithTimestamp(`[scanDirectory] 扫描目录 ${currentPath} 时发生错误:`, dirError); // 记录扫描目录本身的错误
    }
  }

  // 开始递归扫描干净路径
  await scanDirectory(cleanPath);
  // devWithTimestamp(`[scanMovieDirectory] 扫描完成，发现 ${movieFiles.length} 个电影文件`);
  // 对扫描到的电影文件进行进一步处理，例如获取封面等
  return processMovieFiles(movieFiles, baseUrl);
}

import { getMovieDirectoryPath } from "@/utils/paths";

// 存储电影目录路径的文件
const STORAGE_PATH = getMovieDirectoryPath();

/**
 * 从文件中获取存储的电影目录路径。
 * @returns 存储的目录路径字符串，如果文件不存在或读取失败则返回空字符串。
 */
async function getStoredDirectory(): Promise<string> {
  devWithTimestamp(`[getStoredDirectory] 尝试从 ${STORAGE_PATH} 读取存储目录`);
  try {
    // 尝试读取文件内容
    const data = await readFile(STORAGE_PATH, "utf-8");
    devWithTimestamp(`[getStoredDirectory] 成功读取目录: ${data.trim()}`);
    return data.trim(); // 返回清理后的目录路径
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_error) {
    devWithTimestamp(`[getStoredDirectory] 未找到存储目录文件或读取失败:`, _error);
    return ""; // 读取失败或文件不存在时返回空字符串
  }
}

/**
 * 将电影目录路径存储到文件中。
 * @param directory 要存储的目录路径。
 */
async function storeDirectory(directory: string): Promise<void> {
  devWithTimestamp(`[storeDirectory] 尝试将目录 ${directory} 存储到 ${STORAGE_PATH}`);
  try {
    // 写入文件内容
    await writeFile(STORAGE_PATH, directory, "utf-8");
    devWithTimestamp(`[storeDirectory] 成功存储目录: ${directory}`);
  } catch (error) {
    devWithTimestamp(`[storeDirectory] 存储目录失败:`, error);
  }
}

/**
 * GET 请求处理函数，用于获取电影列表数据。
 * 这是前端页面请求电影数据的入口。
 * @returns NextApiResponse 包含电影数据或错误信息。
 */
export async function GET(request: Request) {
  devWithTimestamp(`[GET] 接收到 GET 请求`);
  try {
    
    
    
    const baseUrl = new URL(request.url).origin; // 获取请求的协议和域名
    
    

    // 获取存储的电影目录
    const movieDirectory = await getStoredDirectory();
    
    if (!movieDirectory) {
      devWithTimestamp(`[GET] 未设置电影目录，返回 400 错误`);
      return NextResponse.json({ error: "No directory set" }, { status: 400 });
    }
    // 清理目录路径
    const cleanPath = movieDirectory.replace(/['"]/g, "").replace(/\\/g, "/");
    devWithTimestamp(`[GET] 开始扫描电影目录: ${cleanPath}`);
    // 扫描电影目录并获取所有电影数据
    const allMovieFiles = await scanMovieDirectory(cleanPath, baseUrl);
    devWithTimestamp(`[GET] 完成电影扫描，发现 ${allMovieFiles.length} 个文件`);
    
    // 处理所有电影数据（获取封面等）
    const processedMovies = await processMovieFiles(allMovieFiles, baseUrl);
    devWithTimestamp(`[GET] 完成电影数据处理，返回 ${processedMovies.length} 条电影数据`);

    // 对 finalMovies 进行额外的检查和警告
    processedMovies.forEach(movie => {
      if (movie.code) {
        // 检查标题是否仍然只是番号
        if (movie.title.toLowerCase() === movie.code.toLowerCase()) {
          devWithTimestamp(`[GET /api/movies] 警告: 电影 ${movie.filename} (番号: ${movie.code}) 缺少描述性标题。请检查JavDB抓取是否成功或文件名是否包含描述性信息。`);
        }
      }
      // 检查女优是否缺失或为"unknow"
      if (!movie.actress || movie.actress.toLowerCase() === 'unknow') {
        devWithTimestamp(`[GET /api/movies] 警告: 电影 ${movie.filename} (番号: ${movie.code || 'N/A'}) 缺少女优信息。`);
      }
    });

    const moviesToSend = processedMovies;
    devWithTimestamp(`[GET /api/movies] 返回 ${moviesToSend.length} 部电影数据。`);

    return NextResponse.json({ movies: moviesToSend, total: processedMovies.length });
  } catch (error) {
    devWithTimestamp("[GET /api/movies] 获取电影列表时发生错误:", error);
    return NextResponse.json(
      { error: "无法获取电影列表" },
      { status: 500 }
    );
  }
}

/**
 * PUT 请求处理函数，用于设置电影目录（如果尚未设置）。
 * @returns NextApiResponse 包含成功或错误信息。
 */
export async function PUT() {
  devWithTimestamp(`[PUT] 接收到 PUT 请求`);
  try {
    // 获取当前存储的目录
    const directory = await getStoredDirectory();
    if (directory !== "") {
      devWithTimestamp(`[PUT] 目录已设置，返回 200 状态`);
      return NextResponse.json(
        { error: "Directory already set" },
        { status: 200 }
      );
    }
    devWithTimestamp(`[PUT] 目录未设置，返回 500 状态 (待实现具体设置逻辑)`);
    return NextResponse.json({ message: "Directory jaged" }, { status: 500 });
  } catch (error) {
    devWithTimestamp("[PUT] Error scanning movies:", error);
    return NextResponse.json(
      { error: "PUTFailed to scan movies" },
      { status: 500 }
    );
  }
}

/**
 * POST 请求处理函数，用于接收并存储新的电影目录路径。
 * @param request NextApiRequest 对象，包含请求体 (folderPath)。
 * @returns NextApiResponse 包含成功或错误信息。
 */
export async function POST(request: Request) {
  devWithTimestamp(`[POST] 接收到 POST 请求`);
  try {
    // 从请求体中解析 folderPath
    const { folderPath } = await request.json();
    devWithTimestamp("[POST] 接收到的原始路径:", folderPath);
    // 清理路径
    const cleanPath = folderPath.replace(/['"]/g, "").replace(/\\/g, "/");
    devWithTimestamp("[POST] 处理后的路径:", cleanPath);

    // 存储路径到文件
    devWithTimestamp(`[POST] 尝试存储目录: ${cleanPath}`);
    await storeDirectory(cleanPath);
    devWithTimestamp(`[POST] 目录存储成功`);

    return NextResponse.json({ message: "扫描请求已接收", path: cleanPath });
  } catch (error) {
    devWithTimestamp("[POST] Error scanning movies:", error);
    return NextResponse.json(
      { error: "POSTFailed to scan movies" },
      { status: 500 }
    );
  }
}

/**
 * DELETE 请求处理函数，用于清除存储的电影目录路径。
 * @returns NextApiResponse 包含成功或错误信息。
 */
export async function DELETE() {
  devWithTimestamp(`[DELETE] 接收到 DELETE 请求`);
  try {
    devWithTimestamp(`[DELETE] 尝试清空 movie-directory.txt 文件`);
    // 将 movie-directory.txt 文件内容清空
    await writeFile(STORAGE_PATH, "");
    devWithTimestamp(`[DELETE] movie-directory.txt 文件已清空`);
    return NextResponse.json({ message: "Movie directory cleared" });
  } catch (error) {
    devWithTimestamp("[DELETE] Error clearing movie directory:", error);
    return NextResponse.json(
      { error: "Failed to clear movie directory" },
      { status: 500 }
    );
  }
}
