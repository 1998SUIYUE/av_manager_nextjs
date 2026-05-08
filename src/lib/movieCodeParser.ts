import path from "path";
import { devWithTimestamp } from "@/utils/logger";

export interface ParsedMovieFilename {
  title: string;
  year?: string;
  code?: string;
  coverUrl?: string;
}

const MOVIE_CODE_PATTERN = /([A-Za-z]{2,}-\d+|[A-Za-z]+-[A-Za-z]+-[A-Za-z]?\d+|[A-Za-z]{2,5}\d{2,5})/i;
const YEAR_PATTERN = /\b(19\d{2}|20\d{2})\b/;

export function parseMovieFilename(filename: string): ParsedMovieFilename {
  const nameWithoutExt = path.basename(filename, path.extname(filename));

  // 优先处理 @ 符号后的内容
  const atIndex = nameWithoutExt.lastIndexOf("@");
  const searchableName = atIndex > -1 ? nameWithoutExt.substring(atIndex + 1) : nameWithoutExt;

  const codeMatch = searchableName.match(MOVIE_CODE_PATTERN);
  const code = codeMatch?.[1]?.toUpperCase();
  const year = nameWithoutExt.match(YEAR_PATTERN)?.[0];

  if (!code) {
    devWithTimestamp(`[movieCodeParser] No movie code matched: ${filename}`);
  }

  let title = nameWithoutExt.trim();
  if (code) {
    const index = title.toUpperCase().indexOf(code);
    if (index >= 0) {
      title = title.slice(index + code.length).replace(/^[-_\s.]+/, "").trim();
    }
  }

  return {
    title: title || code || nameWithoutExt,
    year,
    code,
    coverUrl: code ? `https://images.javbus.com/cover/${code}.jpg` : undefined,
  };
}
