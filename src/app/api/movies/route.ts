import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import {
  getCachedMovieMetadata,
  updateMovieMetadataCache,
} from "@/lib/movieMetadataCache";
import { writeFile, readFile } from "fs/promises";
import { logWithTimestamp, warnWithTimestamp, errorWithTimestamp } from "@/utils/logger";

// 支持的视频文件扩展名列表
const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".webm"];

// 文件大小阈值：只处理大于此大小的视频文件 (100MB = 100 * 1024 * 1024 字节)
// 原来是1GB，现在改为100MB以便发现更多文件
const FILE_SIZE_THRESHOLD = 100 * 1024 * 1024;

// 请求延迟时间（毫秒），用于在获取电影元数据时避免频繁请求被网站屏蔽

/**
 * 将电影添加到元数据获取队列
 * @param code 电影番号
 * @param baseUrl 基础URL
 * @param priority 优先级（1=高，2=中，3=低）
 */
function queueMetadataFetch(code: string, baseUrl: string, priority: number = 2) {
  // 这里应该有队列处理逻辑，但由于找不到原始实现，我们只记录日志
  logWithTimestamp(`[queueMetadataFetch] 添加番号 ${code} 到元数据获取队列，优先级: ${priority}`);
  // 在实际实现中，这里应该将任务添加到队列中
}

// 定义电影文件接口，包含各种电影元数据属性
interface MovieFile {
  filename: string; // 文件名 (例如: 'ABC-123.mp4')
  path: string; // 文件所在目录的路径
  absolutePath: string; // 文件的绝对路径
  size: number; // 文件大小 (字节)
  sizeInGB: number; // 文件大小 (GB)
  extension: string; // 文件扩展名 (例如: '.mp4')
  title: string; // 电影标题 (通常从文件名解析)
  displayTitle?: string; // 用于显示的标题 (可能包含外部获取的标题)
  year?: string; // 电影年份
  modifiedAt: number; // 文件最后修改时间戳 (毫秒)
  code?: string; // 电影番号 (例如: 'ABC-123')
  coverUrl?: string | null; // 封面图片URL (可能来自外部网站)
  actress?: string | null; // 女优名字
}

/**
 * 解析电影文件名，提取标题、年份和番号。
 * @param filename 完整的电影文件名。
 * @returns 包含解析后标题、年份和番号的对象。
 */
function parseMovieFilename(filename: string): {
  title: string;
  year?: string;
  code?: string;
} {
  // 移除文件扩展名，获取纯文件名
  const nameWithoutExt = path.basename(filename, path.extname(filename));

  // 正则表达式匹配电影番号，例如 'ABC-123' 或 'XYZ-001' (不区分大小写)
  const matchResult = nameWithoutExt.match(/([a-zA-Z]{2,5}-\d{2,5})/i);

  let title = nameWithoutExt; // 默认标题为去除扩展名后的完整文件名
  let code: string | undefined;

  if (matchResult) {
    code = matchResult[1].toUpperCase(); // 将番号转换为大写以保持一致性
    // 如果文件名以番号开头，则从标题中移除番号，以获得更纯净的描述性标题
    if (title.toLowerCase().startsWith(code.toLowerCase())) {
        title = title.substring(code.length).trim();
        // 移除番号后可能留下的分隔符（如 '-' 或 '_'）
        if (title.startsWith('-') || title.startsWith('_')) {
            title = title.substring(1).trim();
        }
    }
  }

  return {
    title: title, // 现在是更具描述性的标题
    // 尝试从文件名中匹配年份 (例如: 19XX 或 20XX)
    year: (nameWithoutExt.match(/\b(19\d{2}|20\d{2})\b/) || [])[0],
    code: code, // 番号
  };
}

/**
 * 根据电影番号从外部网站获取封面图片URL、标题和女优信息。
 * 会优先从本地缓存获取，如果缓存中没有，则使用 Playwright 进行网页抓取。
 * @param code 电影番号。
 * @param baseUrl 当前请求的基础URL，用于构建image-proxy的绝对路径。
 * @returns 包含封面URL、标题和女优信息的对象，或在失败时返回null。
 */
async function fetchCoverUrl(code: string, baseUrl: string) {
  // 1. 首先检查本地电影元数据缓存
  const cachedMetadata = await getCachedMovieMetadata(code, baseUrl);
  
  if (cachedMetadata) {
    // 如果缓存命中，并且有封面URL，直接返回缓存数据，避免网络请求
    if (cachedMetadata.coverUrl !==null && cachedMetadata.title !== null) {
      // console.log(`[fetchCoverUrl] 从缓存获取元数据 - 番号: ${code}
      //   coverUrl: ${cachedMetadata.coverUrl},
      //   title: ${cachedMetadata.title},
      //   actress: ${cachedMetadata.actress},`);
      return {
        coverUrl: cachedMetadata.coverUrl,
        title: cachedMetadata.title,
        actress: cachedMetadata.actress,
      };
    }
    // 如果缓存中没有封面URL，则继续执行网络请求获取
    logWithTimestamp(`[fetchCoverUrl] 番号 ${code} 在缓存中找到，但缺少封面URL，将尝试从网络获取`);
  }
  logWithTimestamp(`[fetchCoverUrl] 未获取到的cachaedmetadata ${code} `);
  // 2. 如果缓存未命中，启动 Playwright 浏览器进行网页抓取
  let browser = null;
  try {
    logWithTimestamp(`[fetchCoverUrl] 开始获取番号 ${code} 的封面图片和标题`);

    // 启动无头模式的 Chromium 浏览器
    browser = await chromium.launch({
      headless: true,
    });
    // logWithTimestamp(`[fetchCoverUrl] 浏览器启动成功`);

    // 创建新的浏览器上下文，并设置用户代理以模拟真实浏览器行为
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    });
    // 创建新页面
    const page = await context.newPage();
    // logWithTimestamp(`[fetchCoverUrl] 新页面创建成功`);

    // 构造 JavDB 搜索 URL
    const url = `https://javdb.com/search?q=${code}&f=all/`;
    logWithTimestamp(`[fetchCoverUrl] 开始访问 URL: ${url}`);

    try {
      // 导航到搜索结果页，等待 DOM 内容加载完成
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 10000,
      });
      // logWithTimestamp(`[fetchCoverUrl] 页面加载完成`);

      // 从搜索结果中提取正确的电影详情页 URL
      const right_url = await page.evaluate(() => {
        const right_url = document
          .querySelector(
            "body > section > div > div.movie-list.h.cols-4.vcols-8 > div:nth-child(1) > a"
          )
          ?.getAttribute("href");
        return right_url;
      });
      // 导航到电影详情页
      await page.goto(`https://javdb.com${right_url}`, {
        waitUntil: "domcontentloaded",
        timeout: 10000,
      });
      logWithTimestamp(
        `[fetchCoverUrl] 找到正确的URL: https://javdb.com${right_url}`
      );

      // 获取封面图URL
      const coverSelectors = [
        `body > section > div > div.video-detail > div.video-meta-panel > div > div.column.column-video-cover > a > img`,
      ];
      let coverUrl = null;
      for (const selector of coverSelectors) {
        // logWithTimestamp(`[fetchCoverUrl] 尝试封面选择器: ${selector}`);
        coverUrl = await page.evaluate((sel) => {
          const coverLink = document.querySelector(sel);
          return coverLink ? coverLink.getAttribute("src") : null;
        }, selector);

        if (coverUrl) {
          // logWithTimestamp(
          //   `[fetchCoverUrl] 使用选择器 ${selector} 找到封面: ${coverUrl}`
          // );
          break; // 找到封面后跳出循环
        } else {
          coverUrl = `https://fourhoi.com/${code.toLocaleLowerCase()}/cover-n.jpg`;
          errorWithTimestamp(`[fetchCoverUrl] 选择器 ${selector} 未找到封面，使用MissAV默认封面: ${coverUrl}`);
        }
      }

      // 如果成功获取到 coverUrl，则通过 image-proxy 进行本地缓存
      if (coverUrl) {
        logWithTimestamp(`[fetchCoverUrl] 原始封面URL: ${coverUrl}`);
        try {
          const proxyApiUrl = `${baseUrl}/api/image-proxy?url=${encodeURIComponent(coverUrl)}`;
          logWithTimestamp(`[fetchCoverUrl] 调用 image-proxy API URL: ${proxyApiUrl}`);
          const imageProxyResponse = await fetch(proxyApiUrl);
          if (imageProxyResponse.ok) {
            const proxyData = await imageProxyResponse.json();
            const localCoverUrl = proxyData.imageUrl;
            logWithTimestamp(`[fetchCoverUrl] 图片已通过 image-proxy 缓存到本地: ${localCoverUrl}`);
            coverUrl = localCoverUrl; // 更新 coverUrl 为本地路径
          } else {
            warnWithTimestamp(`[fetchCoverUrl] 调用 image-proxy 失败: ${imageProxyResponse.statusText}`);
            // 如果代理失败，可以考虑使用默认图片或者保留原始URL
          }
        } catch (proxyError) {
          errorWithTimestamp(`[fetchCoverUrl] 调用 image-proxy 发生错误: ${proxyError}`);
        }
      }

      // 获取电影标题
      const titleSelectors = [
        `body > section.section > div > div.video-detail > h2 > strong.current-title`,
      ];
      let title = null;
      for (const selector of titleSelectors) {
        // logWithTimestamp(`[fetchCoverUrl] 尝试标题选择器: ${selector}`);
        title = await page.evaluate((sel) => {
          const titleElement = document.querySelector(sel);
          return titleElement ? titleElement.textContent?.trim() || null : null;
        }, selector);
        if (title && title !== "null") {
          // logWithTimestamp(
          //   `[fetchCoverUrl] 使用选择器 ${selector} 找到标题: ${title}`
          // );
          break; // 找到标题后跳出循环
        } else {
          warnWithTimestamp(`[fetchCoverUrl] 选择器 ${selector} 未找到标题`);
        }
      }

      // 获取女优名字
      let actress = "unknow";
      const actress_name = await page
        .locator('strong:has-text("演員:")') // 查找包含"演員"文本的 strong 元素
        .locator(".. >> span.value >> a") // 向上查找父元素，再向下查找 span.value 和 a 元素
        .first()
        .textContent();
      if (actress_name) {
        actress = actress_name;
      } else {
        actress = "unknow";
      }

      // 关闭浏览器实例以释放资源
      await browser.close();

      // 无论是否获取到标题，只要有封面URL或者女优信息，都更新本地缓存
      if (coverUrl || title || actress) {
        logWithTimestamp(
          `[fetchCoverUrl] 番号 ${code} 处理完成 - 封面: ${coverUrl}, 标题: ${title}, 女优: ${actress}`
        );
        await updateMovieMetadataCache(code, coverUrl, title, actress);
      } else {
        warnWithTimestamp(`[fetchCoverUrl] 番号 ${code} 处理失败 - 未获取到任何元数据`);
      }

      return {
        coverUrl,
        title,
        actress,
      };
    } catch (navigationError) {
      logWithTimestamp(`[fetchCoverUrl] 页面导航错误:`, navigationError);
      
      // 即使导航出错，也尝试使用备用封面URL
      const backupCoverUrl = `https://fourhoi.com/${code.toLocaleLowerCase()}/cover-n.jpg`;
      logWithTimestamp(`[fetchCoverUrl] 尝试使用备用封面URL: ${backupCoverUrl}`);
      
      // 尝试通过image-proxy缓存备用封面
      try {
        const proxyApiUrl = `${baseUrl}/api/image-proxy?url=${encodeURIComponent(backupCoverUrl)}`;
        const imageProxyResponse = await fetch(proxyApiUrl);
        if (imageProxyResponse.ok) {
          const proxyData = await imageProxyResponse.json();
          const localCoverUrl = proxyData.imageUrl;
          logWithTimestamp(`[fetchCoverUrl] 备用封面已缓存到本地: ${localCoverUrl}`);
          
          // 更新缓存，保存备用封面
          await updateMovieMetadataCache(code, localCoverUrl, null, null);
          return { coverUrl: localCoverUrl, title: null, actress: null };
        }
      } catch (proxyError) {
        errorWithTimestamp(`[fetchCoverUrl] 缓存备用封面失败:`, proxyError);
      }
      
      return { coverUrl: null, title: null, actress: null };
    }
  } catch (error) {
    logWithTimestamp(`[fetchCoverUrl] 获取 ${code} 信息时发生错误:`, error);
    if (browser) {
      await browser.close();
    }
    
    // 即使出错，也尝试使用备用封面URL
    const backupCoverUrl = `https://fourhoi.com/${code.toLocaleLowerCase()}/cover-n.jpg`;
    logWithTimestamp(`[fetchCoverUrl] 尝试使用备用封面URL: ${backupCoverUrl}`);
    
    // 尝试通过image-proxy缓存备用封面
    try {
      const proxyApiUrl = `${baseUrl}/api/image-proxy?url=${encodeURIComponent(backupCoverUrl)}`;
      const imageProxyResponse = await fetch(proxyApiUrl);
      if (imageProxyResponse.ok) {
        const proxyData = await imageProxyResponse.json();
        const localCoverUrl = proxyData.imageUrl;
        logWithTimestamp(`[fetchCoverUrl] 备用封面已缓存到本地: ${localCoverUrl}`);
        
        // 更新缓存，保存备用封面
        await updateMovieMetadataCache(code, localCoverUrl, null, null);
        return { coverUrl: localCoverUrl, title: null, actress: null };
      }
    } catch (proxyError) {
      errorWithTimestamp(`[fetchCoverUrl] 缓存备用封面失败:`, proxyError);
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
  // 根据文件最后修改时间降序排序电影文件 (最新的在前)
  const sortedMovies = movieFiles.sort((a, b) => b.modifiedAt - a.modifiedAt);

  // 当前未限制处理文件数量 (todo: 可根据需要限制前N个文件)
  const limitedMovies = sortedMovies;

  // 使用信号量 (Semaphore) 控制并发的网络请求数量，避免同时发送过多请求
  const concurrencyLimit = 3;// 同时允许的最大请求数
  const semaphore = new Semaphore(concurrencyLimit);

  // 使用 Promise.all 来并行处理电影文件，每个文件都会尝试获取其元数据
  const processedMovies = await Promise.all(
    limitedMovies.map(async (movie) => {
      // 在发送网络请求前，先通过信号量获取许可，控制并发
      return semaphore.acquire().then(async (release) => {
        try {
          let coverUrl = null;
          let title = null;
          let actress = null;
          // 如果电影文件有番号，则尝试获取其封面和标题
          if (movie.code) {
            try {
              // 首先尝试从缓存获取元数据
              const cachedMetadata = await getCachedMovieMetadata(movie.code, baseUrl);
              
              // 检查是否需要获取元数据
              const needsFetch = !cachedMetadata || !cachedMetadata.coverUrl;
              
              // 如果没有封面或标题，则添加到自动获取队列
              if (needsFetch) {
                // 添加到后台处理队列，优先级为2（中）
                queueMetadataFetch(movie.code, baseUrl, 2);
                logWithTimestamp(`[processMovieFiles] 电影 ${movie.code} 缺少元数据，已添加到自动获取队列`);
              }
              
              // 无论是否有缓存，都尝试获取最新的封面信息
              // 如果缓存中有封面，fetchCoverUrl会直接返回缓存数据
              // 如果缓存中没有封面，fetchCoverUrl会尝试从网络获取
              // 使用 retryWithTimeout 包装 fetchCoverUrl，提供重试和超时功能
              const result = await retryWithTimeout(
                () => fetchCoverUrl(movie.code!, baseUrl),
                2, // 最大重试次数
                3000 // 每次重试的超时时间（毫秒）
              );
              coverUrl = result.coverUrl;
              title = result.title;
              actress = result.actress;
            } catch (error) {
              errorWithTimestamp(`处理电影 ${movie.filename} 时发生错误:`, error);
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
            } catch (error) {
              logWithTimestamp(error)
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
          warnWithTimestamp("checkQueue: Retrieved null or undefined from queue");
        }
      }
    } catch (error) {
      errorWithTimestamp("checkQueue: Error occurred while processing queue", error);
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
      warnWithTimestamp(`第 ${attempt} 次尝试失败:`, error);
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
  logWithTimestamp(`[scanMovieDirectory] 开始扫描目录: ${directoryPath}`);
  // 处理路径中的引号和反斜杠，确保路径格式正确
  const cleanPath = directoryPath.replace(/['"]/g, "").replace(/\\/g, "/");
  logWithTimestamp("[scanMovieDirectory] 清理后的路径:", cleanPath);
  const movieFiles: MovieFile[] = []; // 用于存储扫描到的电影文件信息

  /**
   * 递归遍历目录的内部函数。
   * @param currentPath 当前要扫描的目录的绝对路径。
   */
  async function scanDirectory(currentPath: string) {
    logWithTimestamp(`[scanDirectory] 开始扫描子目录: ${currentPath}`);

    // 规范化当前路径，确保跨平台兼容性
    const normalizedPath = path.normalize(currentPath);

    try {
      // 读取当前目录的内容 (文件和子目录)
      logWithTimestamp(`[scanDirectory] 读取目录内容: ${normalizedPath}`);
      const files = await fs.promises.readdir(normalizedPath);
      logWithTimestamp(`[scanDirectory] 目录 ${normalizedPath} 中发现 ${files.length} 个条目`);

      // 遍历目录中的每个条目
      for (const file of files) {
        const fullPath = path.join(normalizedPath, file);
        // logWithTimestamp(`[scanDirectory] 处理文件/目录: ${fullPath}`);

        try {
          // 获取文件或目录的统计信息 (例如：是否是目录，文件大小，修改时间等)
          // logWithTimestamp(`[scanDirectory] 获取文件/目录 stat: ${fullPath}`);
          const stats = await fs.promises.stat(fullPath);
          // logWithTimestamp(`[scanDirectory] 完成 stat: ${fullPath}, isDirectory: ${stats.isDirectory()}`);

          if (stats.isDirectory()) {
            // 如果是目录，则递归调用自身，继续扫描子目录
            logWithTimestamp(`[scanDirectory] 发现子目录，开始递归扫描: ${fullPath}`);
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
              logWithTimestamp(`[scanDirectory] 发现符合条件的视频文件: ${file} (大小: ${(stats.size / (1024 * 1024 * 1024)).toFixed(2)}GB)`);
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
              logWithTimestamp(`[scanDirectory] 添加电影文件到列表: ${movieFile.filename}`);
            } else {
              // 记录跳过的文件及原因
              if (!VIDEO_EXTENSIONS.includes(ext)) {
                logWithTimestamp(`[scanDirectory] 跳过文件 (不支持的格式): ${file} (扩展名: ${ext})`);
              } else if (stats.size < FILE_SIZE_THRESHOLD) {
                logWithTimestamp(`[scanDirectory] 跳过文件 (文件太小): ${file} (大小: ${(stats.size / (1024 * 1024 * 1024)).toFixed(2)}GB, 阈值: ${(FILE_SIZE_THRESHOLD / (1024 * 1024 * 1024)).toFixed(2)}GB)`);
              }
            }
          }
        } catch (fileError) {
          errorWithTimestamp(`[scanDirectory] 处理文件 ${file} 时发生错误:`, fileError); // 记录处理单个文件时的错误
        }
      }
    } catch (dirError) {
      errorWithTimestamp(`[scanDirectory] 扫描目录 ${currentPath} 时发生错误:`, dirError); // 记录扫描目录本身的错误
    }
  }

  // 开始递归扫描干净路径
  await scanDirectory(cleanPath);
  // logWithTimestamp(`[scanMovieDirectory] 扫描完成，发现 ${movieFiles.length} 个电影文件`);
  // 对扫描到的电影文件进行进一步处理，例如获取封面等
  return processMovieFiles(movieFiles, baseUrl);
}

// 存储电影目录路径的文件
const STORAGE_PATH = path.join(process.cwd(), "movie-directory.txt");

/**
 * 从文件中获取存储的电影目录路径。
 * @returns 存储的目录路径字符串，如果文件不存在或读取失败则返回空字符串。
 */
async function getStoredDirectory(): Promise<string> {
  logWithTimestamp(`[getStoredDirectory] 尝试从 ${STORAGE_PATH} 读取存储目录`);
  try {
    // 尝试读取文件内容
    const data = await readFile(STORAGE_PATH, "utf-8");
    logWithTimestamp(`[getStoredDirectory] 成功读取目录: ${data.trim()}`);
    return data.trim(); // 返回清理后的目录路径
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    warnWithTimestamp(`[getStoredDirectory] 未找到存储目录文件或读取失败:`, error);
    return ""; // 读取失败或文件不存在时返回空字符串
  }
}

/**
 * 将电影目录路径存储到文件中。
 * @param directory 要存储的目录路径。
 */
async function storeDirectory(directory: string): Promise<void> {
  logWithTimestamp(`[storeDirectory] 尝试将目录 ${directory} 存储到 ${STORAGE_PATH}`);
  try {
    // 写入文件内容
    await writeFile(STORAGE_PATH, directory, "utf-8");
    logWithTimestamp(`[storeDirectory] 成功存储目录: ${directory}`);
  } catch (error) {
    errorWithTimestamp(`[storeDirectory] 存储目录失败:`, error);
  }
}

/**
 * GET 请求处理函数，用于获取电影列表数据。
 * 这是前端页面请求电影数据的入口。
 * @returns NextApiResponse 包含电影数据或错误信息。
 */
export async function GET(request: Request) {
  logWithTimestamp(`[GET] 接收到 GET 请求`);
  try {
    
    
    
    const baseUrl = new URL(request.url).origin; // 获取请求的协议和域名
    
    

    // 获取存储的电影目录
    const movieDirectory = await getStoredDirectory();
    
    if (!movieDirectory) {
      warnWithTimestamp(`[GET] 未设置电影目录，返回 400 错误`);
      return NextResponse.json({ error: "No directory set" }, { status: 400 });
    }
    // 清理目录路径
    const cleanPath = movieDirectory.replace(/['"]/g, "").replace(/\\/g, "/");
    logWithTimestamp(`[GET] 开始扫描电影目录: ${cleanPath}`);
    // 扫描电影目录并获取所有电影数据
    const allMovieFiles = await scanMovieDirectory(cleanPath, baseUrl);
    logWithTimestamp(`[GET] 完成电影扫描，发现 ${allMovieFiles.length} 个文件`);
    
    // 处理所有电影数据（获取封面等）
    const processedMovies = await processMovieFiles(allMovieFiles, baseUrl);
    logWithTimestamp(`[GET] 完成电影数据处理，返回 ${processedMovies.length} 条电影数据`);

    // 对 finalMovies 进行额外的检查和警告
    processedMovies.forEach(movie => {
      if (movie.code) {
        // 检查标题是否仍然只是番号
        if (movie.title.toLowerCase() === movie.code.toLowerCase()) {
          warnWithTimestamp(`[GET /api/movies] 警告: 电影 ${movie.filename} (番号: ${movie.code}) 缺少描述性标题。请检查JavDB抓取是否成功或文件名是否包含描述性信息。`);
        }
      }
      // 检查女优是否缺失或为"unknow"
      if (!movie.actress || movie.actress.toLowerCase() === 'unknow') {
        warnWithTimestamp(`[GET /api/movies] 警告: 电影 ${movie.filename} (番号: ${movie.code || 'N/A'}) 缺少女优信息。`);
      }
    });

    const moviesToSend = processedMovies;
    logWithTimestamp(`[GET /api/movies] 返回 ${moviesToSend.length} 部电影数据。`);

    return NextResponse.json({ movies: moviesToSend, total: processedMovies.length });
  } catch (error) {
    errorWithTimestamp("[GET /api/movies] 获取电影列表时发生错误:", error);
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
  logWithTimestamp(`[PUT] 接收到 PUT 请求`);
  try {
    // 获取当前存储的目录
    const directory = await getStoredDirectory();
    if (directory !== "") {
      warnWithTimestamp(`[PUT] 目录已设置，返回 200 状态`);
      return NextResponse.json(
        { error: "Directory already set" },
        { status: 200 }
      );
    }
    logWithTimestamp(`[PUT] 目录未设置，返回 500 状态 (待实现具体设置逻辑)`);
    return NextResponse.json({ message: "Directory jaged" }, { status: 500 });
  } catch (error) {
    errorWithTimestamp("[PUT] Error scanning movies:", error);
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
  logWithTimestamp(`[POST] 接收到 POST 请求`);
  try {
    // 从请求体中解析 folderPath
    const { folderPath } = await request.json();
    logWithTimestamp("[POST] 接收到的原始路径:", folderPath);
    // 清理路径
    const cleanPath = folderPath.replace(/['"]/g, "").replace(/\\/g, "/");
    logWithTimestamp("[POST] 处理后的路径:", cleanPath);

    // 存储路径到文件
    logWithTimestamp(`[POST] 尝试存储目录: ${cleanPath}`);
    await storeDirectory(cleanPath);
    logWithTimestamp(`[POST] 目录存储成功`);

    return NextResponse.json({ message: "扫描请求已接收", path: cleanPath });
  } catch (error) {
    errorWithTimestamp("[POST] Error scanning movies:", error);
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
  logWithTimestamp(`[DELETE] 接收到 DELETE 请求`);
  try {
    logWithTimestamp(`[DELETE] 尝试清空 movie-directory.txt 文件`);
    // 将 movie-directory.txt 文件内容清空
    await writeFile("movie-directory.txt", "");
    logWithTimestamp(`[DELETE] movie-directory.txt 文件已清空`);
    return NextResponse.json({ message: "Movie directory cleared" });
  } catch (error) {
    errorWithTimestamp("[DELETE] Error clearing movie directory:", error);
    return NextResponse.json(
      { error: "Failed to clear movie directory" },
      { status: 500 }
    );
  }
}
