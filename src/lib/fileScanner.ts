import fs from "fs";
import path from "path";
import { devWithTimestamp } from "@/utils/logger";
import { parseMovieFilename } from "@/lib/movieCodeParser";

export interface MovieFile {
  filename: string;
  path: string;
  absolutePath: string;
  size: number;
  sizeInGB: number;
  extension: string;
  title?: string;
  year?: string;
  modifiedAt: number;
  code?: string;
  coverUrl?: string;
}

export function scanMovieDirectory(directoryPath: string): MovieFile[] {
  const movieFiles: MovieFile[] = [];
  const supportedExtensions = [".mp4", ".mkv", ".avi", ".mov", ".webm"];

  function scanDirectory(currentPath: string) {
    const files = fs.readdirSync(currentPath);

    files.forEach((file) => {
      const fullPath = path.join(currentPath, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scanDirectory(fullPath);
        return;
      }

      const extension = path.extname(file).toLowerCase();
      if (!supportedExtensions.includes(extension)) {
        devWithTimestamp(`[scanMovieDirectory] Unsupported file type: ${fullPath}`);
        return;
      }

      const parsedInfo = parseMovieFilename(file);
      movieFiles.push({
        filename: file,
        path: currentPath,
        absolutePath: path.resolve(fullPath),
        size: stat.size,
        sizeInGB: Number((stat.size / (1024 * 1024 * 1024)).toFixed(1)),
        extension,
        title: parsedInfo.title,
        year: parsedInfo.year,
        code: parsedInfo.code,
        coverUrl: parsedInfo.coverUrl,
        modifiedAt: stat.mtimeMs,
      });
    });
  }

  scanDirectory(directoryPath);
  return movieFiles;
}

export { parseMovieFilename };
