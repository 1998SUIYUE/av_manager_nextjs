import { NextResponse } from "next/server";
import fs from "fs";
import { readFile } from "fs/promises";
import { devWithTimestamp } from "@/utils/logger";
import { getMovieDirectoryPath } from "@/utils/paths";
import { getMovieLibrary } from "@/lib/movieLibraryService";

const STORAGE_PATH = getMovieDirectoryPath();

async function getStoredDirectory(): Promise<string> {
  try {
    const data = await readFile(STORAGE_PATH, "utf-8");
    return data.trim();
  } catch {
    return "";
  }
}

export async function GET(request: Request) {
  devWithTimestamp("[movies-list] GET");

  try {
    const forceRescan = new URL(request.url).searchParams.get("rescan") === "1";
    const movieDirectory = await getStoredDirectory();

    if (!movieDirectory) {
      return NextResponse.json({ error: "还没有设置影片目录" }, { status: 400 });
    }

    if (!fs.existsSync(movieDirectory)) {
      return NextResponse.json({ error: "影片目录不存在", path: movieDirectory }, { status: 404 });
    }

    const movies = await getMovieLibrary(movieDirectory, forceRescan);

    devWithTimestamp(`[movies-list] Return ${movies.length} movies`);
    return NextResponse.json({
      movies,
      total: movies.length,
    });
  } catch (error) {
    devWithTimestamp("[movies-list] Failed to get movie list:", error);
    return NextResponse.json({ error: "无法获取影片列表" }, { status: 500 });
  }
}
