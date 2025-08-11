import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { readFile } from "fs/promises";
import { devWithTimestamp } from "@/utils/logger";
import { getMovieDirectoryPath } from "@/utils/paths";

// ==================================
// 复用自 /api/movies/route.ts 的代码
// ==================================

const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".webm"];
const FILE_SIZE_THRESHOLD = 100 * 1024 * 1024;

interface MovieFile {
  filename: string;
  path: string;
  absolutePath: string;
  size: number;
  sizeInGB: number;
  extension: string;
  title: string;
  year?: string;
  modifiedAt: number;
  code?: string;
}

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
      if (title.startsWith("-") || title.startsWith("_")) {
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

const STORAGE_PATH = getMovieDirectoryPath();

async function getStoredDirectory(): Promise<string> {
  try {
    const data = await readFile(STORAGE_PATH, "utf-8");
    return data.trim();
  } catch {
    return "";
  }
}

// ==================================
// 简化的扫描函数 (核心修改)
// ==================================

/**
 * (简化版) 遍历指定目录下的所有文件，找到满足条件的视频文件。
 * @param directoryPath 目录的绝对路径。
 * @returns 一个 Promise，resolve 时携带一个 MovieFile 数组。
 */
async function scanMovieDirectory(directoryPath: string): Promise<MovieFile[]> {
  devWithTimestamp(`[movies-list] 开始扫描目录: ${directoryPath}`);
  const movieFiles: MovieFile[] = [];
  const cleanPath = directoryPath.replace(/['"]/g, "").replace(/\\/g, "/");

  async function scan(currentPath: string) {
    try {
      const files = await fs.promises.readdir(currentPath);
      for (const file of files) {
        const fullPath = path.join(currentPath, file);
        try {
          const stats = await fs.promises.stat(fullPath);
          if (stats.isDirectory()) {
            await scan(fullPath);
          } else {
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
              movieFiles.push(movieFile);
            }
          }
        } catch (fileError) {
          devWithTimestamp(
            `[movies-list] 处理文件 ${file} 时发生错误:`,
            fileError
          );
        }
      }
    } catch (dirError) {
      devWithTimestamp(
        `[movies-list] 扫描目录 ${currentPath} 时发生错误:`,
        dirError
      );
    }
  }

  await scan(cleanPath);
  devWithTimestamp(`[movies-list] 扫描完成，发现 ${movieFiles.length} 个电影文件`);
  return movieFiles;
}


// ==================================
// API 入口 (GET)
// ==================================

import { getAllCachedMovieMetadata } from "@/lib/movieMetadataCache";

export async function GET() {
  devWithTimestamp(`[movies-list] 接收到 GET 请求`);
  try {
    const movieDirectory = await getStoredDirectory();

    if (!movieDirectory) {
      return NextResponse.json({ error: "No directory set" }, { status: 400 });
    }
    
    if (!fs.existsSync(movieDirectory)) {
        return NextResponse.json(
            { error: "Directory not found", path: movieDirectory },
            { status: 404 }
        );
    }

    // 1. Scan file system to get the base list of movies
    const moviesFromDisk = await scanMovieDirectory(movieDirectory);
    
    // 2. Get the entire metadata cache (from memory)
    const metadataCache = await getAllCachedMovieMetadata();

    // 3. Merge cached data into the list
    const mergedMovies = moviesFromDisk.map(movie => {
        if (movie.code) {
            const cachedDetails = metadataCache.get(movie.code);
            if (cachedDetails) {
                // Return a new object with merged properties
                return { ...movie, ...cachedDetails };
            }
        }
        return movie; // Return original if no code or no cache hit
    });

    // 4. Sort the final list
    mergedMovies.sort((a, b) => b.modifiedAt - a.modifiedAt);

    devWithTimestamp(`[movies-list] 返回 ${mergedMovies.length} 条混合电影数据`);

    return NextResponse.json({
      movies: mergedMovies,
      total: mergedMovies.length,
    });
  } catch (error) {
    devWithTimestamp("[movies-list] 获取电影列表时发生错误:", error);
    return NextResponse.json({ error: "无法获取电影列表" }, { status: 500 });
  }
}
