import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { mkdir, writeFile, readFile } from "fs/promises";
import { devWithTimestamp } from "@/utils/logger";
import { getMovieDirectoryPath } from "@/utils/paths";

// 存储电影目录路径的文件
const STORAGE_PATH = getMovieDirectoryPath();

/**
 * 从文件中获取存储的电影目录路径。
 * @returns 存储的目录路径字符串，如果文件不存在或读取失败则返回空字符串。
 */
async function getStoredDirectory(): Promise<string> {
  try {
    const data = await readFile(STORAGE_PATH, "utf-8");
    return data.trim();
  } catch {
    return "";
  }
}

/**
 * 将电影目录路径存储到文件中。
 */
async function storeDirectory(directory: string): Promise<void> {
  await mkdir(path.dirname(STORAGE_PATH), { recursive: true });
  await writeFile(STORAGE_PATH, directory, "utf-8");
}

/**
 * GET — 返回当前存储的影片目录信息。
 */
export async function GET() {
  const directory = await getStoredDirectory();
  if (!directory) {
    return NextResponse.json({ error: "No directory set" }, { status: 400 });
  }
  return NextResponse.json({
    directory,
    exists: fs.existsSync(directory),
  });
}

/**
 * PUT — 检查目录是否已设置（供首页跳转判断）。
 */
export async function PUT() {
  try {
    const directory = await getStoredDirectory();
    if (directory) {
      devWithTimestamp(`[PUT] 目录已设置`);
      return NextResponse.json(
        { error: "Directory already set" },
        { status: 200 }
      );
    }
    return NextResponse.json(
      { message: "Directory not set" },
      { status: 400 }
    );
  } catch (error) {
    devWithTimestamp("[PUT] Error:", error);
    return NextResponse.json({ error: "Failed to check directory" }, { status: 500 });
  }
}

/**
 * POST — 接收并存储新的电影目录路径。
 */
export async function POST(request: Request) {
  try {
    const { folderPath } = await request.json();
    if (typeof folderPath !== "string" || !folderPath.trim()) {
      return NextResponse.json({ error: "缺少 folderPath" }, { status: 400 });
    }

    const cleanPath = folderPath.replace(/['"]/g, "").trim();
    await storeDirectory(cleanPath);
    devWithTimestamp(`[POST] 目录已存储: ${cleanPath}`);

    return NextResponse.json({ message: "目录设置成功", path: cleanPath });
  } catch (error) {
    devWithTimestamp("[POST] Error:", error);
    return NextResponse.json(
      { error: "Failed to store movie directory" },
      { status: 500 }
    );
  }
}

/**
 * DELETE — 清除存储的电影目录路径。
 */
export async function DELETE() {
  try {
    await mkdir(path.dirname(STORAGE_PATH), { recursive: true });
    await writeFile(STORAGE_PATH, "");
    return NextResponse.json({ message: "Movie directory cleared" });
  } catch (error) {
    devWithTimestamp("[DELETE] Error:", error);
    return NextResponse.json(
      { error: "Failed to clear movie directory" },
      { status: 500 }
    );
  }
}
