import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import {
  getCachedMovieMetadata,
  updateMovieMetadataCache,
} from "@/lib/movieMetadataCache";
import { writeFile, readFile } from "fs/promises";

// 支持的视频文件扩展名
const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".webm"];

// 文件大小阈值：1GB = 1024 * 1024 * 1024 字节
const FILE_SIZE_THRESHOLD = 1 * 1024 * 1024 * 1024;

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
  coverUrl?: string;
  actress?: string;
}

function parseMovieFilename(filename: string): {
  title: string;
  year?: string;
  code?: string;
} {
  const nameWithoutExt = path.basename(filename, path.extname(filename));

  // 正则匹配 3-4个字母 + 连字符 + 3-4个数字
  const matchResult = nameWithoutExt.match(/([a-zA-Z]{2,5}-\d{2,5})/);

  const parsedTitle = matchResult ? matchResult[1] : nameWithoutExt;

  // console.log(`原始文件名: ${nameWithoutExt}, 解析后标题: ${parsedTitle}`);

  return {
    title: parsedTitle,
    year: (nameWithoutExt.match(/\b(19\d{2}|20\d{2})\b/) || [])[0],
    code: matchResult ? matchResult[1] : undefined,
  };
}

async function fetchCoverUrl(code: string) {
  // 首先检查缓存
  const cachedMetadata = await getCachedMovieMetadata(code);
  if (cachedMetadata) {
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

  let browser = null;
  try {
    console.log(`[fetchCoverUrl] 开始获取番号 ${code} 的封面图片和标题`);

    browser = await chromium.launch({
      headless: true,
    });
    // console.log(`[fetchCoverUrl] 浏览器启动成功`);

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    });
    const page = await context.newPage();
    // console.log(`[fetchCoverUrl] 新页面创建成功`);
    const url = `https://javdb.com/search?q=${code}&f=all/`;
    // const url = `https://missav.com/dm13/cn/${code}`;
    console.log(`[fetchCoverUrl] 开始访问 URL: ${url}`);

    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 10000,
      });
      // console.log(`[fetchCoverUrl] 页面加载完成`);
      const right_url = await page.evaluate(() => {
        const right_url = document
          .querySelector(
            "body > section > div > div.movie-list.h.cols-4.vcols-8 > div:nth-child(1) > a"
          )
          ?.getAttribute("href");
        return right_url;
      });
      await page.goto(`https://javdb.com${right_url}`, {
        waitUntil: "domcontentloaded",
        timeout: 10000,
      });
      console.log(
        `[fetchCoverUrl] 找到正确的URL: https://javdb.com${right_url}`
      );
      // 获取封面图
      const coverSelectors = [
        `body > section > div > div.video-detail > div.video-meta-panel > div > div.column.column-video-cover > a > img`,
      ];
      let coverUrl = null;
      for (const selector of coverSelectors) {
        // console.log(`[fetchCoverUrl] 尝试封面选择器: ${selector}`);
        coverUrl = await page.evaluate((sel) => {
          const coverLink = document.querySelector(sel);
          return coverLink ? coverLink.getAttribute("src") : null;
        }, selector);

        if (coverUrl) {
          // console.log(
          //   `[fetchCoverUrl] 使用选择器 ${selector} 找到封面: ${coverUrl}`
          // );
          break;
        } else {
          coverUrl = `https://fourhoi.com/${code.toLocaleLowerCase()}/cover-n.jpg`;
          console.log(
            `[error] 选择器 ${selector} 未找到封面 使用missav默认封面https://fourhoi.com/${code.toLocaleLowerCase()}/cover-n.jpg`
          );
        }
      }

      // 获取番名
      const titleSelectors = [
        `body > section > div > div.video-detail > h2 > strong.current-title`,
      ];
      let title = null;
      for (const selector of titleSelectors) {
        // console.log(`[fetchCoverUrl] 尝试标题选择器: ${selector}`);
        title = await page.evaluate((sel) => {
          const titleElement = document.querySelector(sel);
          return titleElement ? titleElement.textContent?.trim() || null : null;
        }, selector);
        if (title && title !== "null") {
          // console.log(
          //   `[fetchCoverUrl] 使用选择器 ${selector} 找到标题: ${title}`
          // );
          break;
        } else {
          console.log(`[error] 选择器 ${selector} 未找到标题`);
        }
      }

      // 获取女优名字
      // body > section > div > div.video-detail > div.video-meta-panel > div > div:nth-child(2) > nav > div:nth-child(10) > span > a:nth-child(1)

      let actress = "unknow";
      const actress_name = await page
        .locator('strong:has-text("演員:")')
        .locator(".. >> span.value >> a")
        .first()
        .textContent();
      if (actress_name) {
        actress = actress_name;
      } else {
        actress = "unknow";
      }
      await browser.close();
      // 更新缓存
      if (title) {
        console.log(
          `[fetchCoverUrl] 番号 ${code} 处理完成 - 封面: ${coverUrl}, 标题: ${title}, 女优: ${actress}`
        );
        await updateMovieMetadataCache(code, coverUrl, title, actress);
      } else {
        console.log(
          `[error] 番号 ${code} 处理失败 - 封面: ${coverUrl}, 标题: ${title}, 女优: ${actress}`
        );
      }

      return {
        coverUrl,
        title,
        actress,
      };
    } catch (navigationError) {
      console.error(`[fetchCoverUrl] 页面导航错误:`, navigationError);

      return { coverUrl: null, title: null, actress: null };
    }
  } catch (error) {
    console.error(`[fetchCoverUrl] 获取 ${code} 信息时发生错误:`, error);
    if (browser) {
      await browser.close();
    }
    return { coverUrl: null, title: null, actress: null };
  }
}

async function processMovieFiles(movieFiles: MovieFile[]) {
  // console.log(movieFiles);
  // 按文件大小降序排序
  const sortedMovies = movieFiles.sort((a, b) => b.modifiedAt - a.modifiedAt);

  // 限制处理前20个文件
  // todo
  // const limitedMovies = sortedMovies.slice(0, 50);
  const limitedMovies = sortedMovies;
  // 使用信号量控制并发
  const concurrencyLimit = 5;
  const semaphore = new Semaphore(concurrencyLimit);

  const processedMovies = await Promise.all(
    limitedMovies.map(async (movie) => {
      // 使用信号量控制并发
      return semaphore.acquire().then(async (release) => {
        try {
          let coverUrl = null;
          let title = null;
          let actress = null;

          // 如果有番号，尝试获取封面和标题（带重试和超时）
          if (movie.code) {
            try {
              const result = await retryWithTimeout(
                () => fetchCoverUrl(movie.code!),
                3, // 最大重试次数
                10000 // 每次重试的超时时间（毫秒）
              );
              coverUrl = result.coverUrl;
              title = result.title;
              actress = result.actress;
            } catch (error) {
              console.error(`处理电影 ${movie.filename} 时发生错误:`, error);
            }
          }

          return {
            ...movie,
            coverUrl,
            displayTitle: title || movie.title,
            actress,
          };
        } finally {
          release(); // 释放信号量
        }
      });
    })
  );
  // 检测重复文件
  const duplicateMovies: MovieFile[] = [];
  const seenPaths = new Set<string>();

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
      console.log(`重复文件: 
  - 文件名: ${movie.filename}
  - 路径: ${movie.path}
  - 大小: ${movie.sizeInGB}GB;
`);
    });
    console.log(`总共检测到 ${duplicateMovies.length} 个重复文件`);
  } else {
    console.log("没有检测到重复文件");
  }
  return processedMovies;
}

// 信号量类：控制并发数量
class Semaphore {
  private permits: number;
  private queue: Array<() => void>;

  constructor(permits: number) {
    this.permits = permits;
    this.queue = [];
  }

  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const release = () => {
        this.permits++;
        this.checkQueue();
      };

      if (this.permits > 0) {
        this.permits--;
        resolve(release);
      } else {
        this.queue.push(() => {
          this.permits--;
          resolve(release);
        });
      }
    });
  }

  private checkQueue() {
    try {
      if (this.queue.length > 0 && this.permits > 0) {
        const next = this.queue.shift();
        if (next) {
          next();
        } else {
          console.warn("checkQueue: Retrieved null or undefined from queue");
        }
      }
    } catch (error) {
      console.error("checkQueue: Error occurred while processing queue", error);
    }
  }
}

// 带重试和超时的函数装饰器
async function retryWithTimeout<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  timeout: number = 10000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await Promise.race([
        fn(),
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error("操作超时")), timeout)
        ),
      ]);
    } catch (error) {
      console.warn(`第 ${attempt} 次尝试失败:`, error);
      lastError = error as Error;

      // 指数退避策略：每次重试增加等待时间
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * Math.pow(2, attempt))
      );
    }
  }

  throw lastError || new Error("所有重试尝试均失败");
}

/**
 * 遍历指定目录下的所有文件，找到满足条件的视频文件，提取视频文件的元数据
 * @param directoryPath 目录的绝对路径
 * @returns 一个 Promise，resolve 时携带一个 MovieFile 数组
 */
async function scanMovieDirectory(directoryPath: string) {
  // 处理路径中的引号和反斜杠
  const cleanPath = directoryPath.replace(/['"]/g, "").replace(/\\/g, "/");
  console.log("清理后的路径:", cleanPath);
  const movieFiles: MovieFile[] = [];

  /**
   * 递归遍历目录
   * @param currentPath 当前目录的绝对路径
   */
  async function scanDirectory(currentPath: string) {
    // console.log(`开始扫描目录 ${currentPath}`);

    const normalizedPath = path.normalize(currentPath);
    // console.log("规范化后的路径:", normalizedPath);

    try {
      const files = await fs.promises.readdir(normalizedPath);

      for (const file of files) {
        const fullPath = path.join(normalizedPath, file);

        try {
          const stats = await fs.promises.stat(fullPath);

          if (stats.isDirectory()) {
            // console.log(`发现目录 ${fullPath}`);
            await scanDirectory(fullPath);
          } else {
            // console.log(`发现文件 ${fullPath}`);

            const ext = path.extname(file).toLowerCase();
            if (
              VIDEO_EXTENSIONS.includes(ext) &&
              stats.size >= FILE_SIZE_THRESHOLD
            ) {
              const parsedInfo = parseMovieFilename(file);
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

              movieFiles.push(movieFile);
            }
          }
        } catch (fileError) {
          console.error(`Error processing file ${file}:`, fileError);
        }
      }
    } catch (dirError) {
      console.error(`Error scanning directory ${currentPath}:`, dirError);
    }
  }

  await scanDirectory(cleanPath);
  return processMovieFiles(movieFiles);
}

const STORAGE_PATH = path.join(process.cwd(), "movie-directory.txt");

async function getStoredDirectory(): Promise<string> {
  try {
    const data = await readFile(STORAGE_PATH, "utf-8");
    return data.trim();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    return "";
  }
}

async function storeDirectory(directory: string): Promise<void> {
  await writeFile(STORAGE_PATH, directory, "utf-8");
}

export async function GET() {
  try {
    const movieDirectory = await getStoredDirectory();
    //console.log("get接收到的原始路径:", movieDirectory);
    if (!movieDirectory) {
      return NextResponse.json({ error: "No directory set" }, { status: 400 });
    }
    // 清理路径
    const cleanPath = movieDirectory.replace(/['"]/g, "").replace(/\\/g, "/");
    //console.log("get处理后的路径:", cleanPath);
    const movies = await scanMovieDirectory(cleanPath);
    // console.log("扫描到的电影数据:", movies);
    return NextResponse.json(await Promise.all(movies));
  } catch (error) {
    console.error("getError scanning movies:", error);
    return NextResponse.json(
      { error: "getFailed to scan movies" },
      { status: 500 }
    );
  }
}
export async function PUT() {
  try {
    const directory = await getStoredDirectory();
    if (directory !== "") {
      return NextResponse.json(
        { error: "Directory already set" },
        { status: 200 }
      );
    }
    return NextResponse.json({ message: "Directory jaged" }, { status: 500 });
  } catch (error) {
    console.error("PUTError scanning movies:", error);
    return NextResponse.json(
      { error: "PUTFailed to scan movies" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { folderPath } = await request.json();
    console.log("POST接收到的原始路径:", folderPath);
    // 清理路径
    const cleanPath = folderPath.replace(/['"]/g, "").replace(/\\/g, "/");
    console.log("POST处理后的路径:", cleanPath);

    // 存储路径
    await storeDirectory(cleanPath);

    return NextResponse.json({ message: "扫描请求已接收", path: cleanPath });
  } catch (error) {
    console.error("POSTError scanning movies:", error);
    return NextResponse.json(
      { error: "POSTFailed to scan movies" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await writeFile("movie-directory.txt", "");
    return NextResponse.json({ message: "Movie directory cleared" });
  } catch (error) {
    console.error("Error clearing movie directory:", error);
    return NextResponse.json(
      { error: "Failed to clear movie directory" },
      { status: 500 }
    );
  }
}
