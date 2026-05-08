import fs from "fs";
import path from "path";
import { devWithTimestamp } from "@/utils/logger";
import { parseMovieFilename } from "@/lib/movieCodeParser";

export const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".webm"];
export const FILE_SIZE_THRESHOLD = 100 * 1024 * 1024;

export interface MovieFile {
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
  coverUrl?: string;
}

export async function scanMovieDirectory(directoryPath: string): Promise<MovieFile[]> {
  const movieFiles: MovieFile[] = [];
  const cleanPath = directoryPath.replace(/['"]/g, "").replace(/\\/g, "/");

  devWithTimestamp(`[movieScanner] Start scanning: ${cleanPath}`);

  async function scan(currentPath: string) {
    let entries: string[] = [];
    try {
      entries = await fs.promises.readdir(currentPath);
    } catch (error) {
      devWithTimestamp(`[movieScanner] Failed to read directory: ${currentPath}`, error);
      return;
    }

    for (const file of entries) {
      const fullPath = path.join(currentPath, file);

      try {
        const stats = await fs.promises.stat(fullPath);
        if (stats.isDirectory()) {
          await scan(fullPath);
          continue;
        }

        const extension = path.extname(file).toLowerCase();
        if (!VIDEO_EXTENSIONS.includes(extension) || stats.size < FILE_SIZE_THRESHOLD) {
          continue;
        }

        const parsedInfo = parseMovieFilename(file);
        movieFiles.push({
          filename: file,
          path: fullPath,
          absolutePath: path.resolve(fullPath),
          size: stats.size,
          sizeInGB: Number((stats.size / (1024 * 1024 * 1024)).toFixed(2)),
          extension,
          title: parsedInfo.title,
          year: parsedInfo.year,
          code: parsedInfo.code,
          coverUrl: parsedInfo.coverUrl,
          modifiedAt: stats.mtimeMs,
        });
      } catch (error) {
        devWithTimestamp(`[movieScanner] Failed to process file: ${fullPath}`, error);
      }
    }
  }

  await scan(cleanPath);
  devWithTimestamp(`[movieScanner] Scan completed, found ${movieFiles.length} movie files`);
  return movieFiles;
}
