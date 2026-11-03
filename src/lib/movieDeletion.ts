import { promises as fs } from "fs";
import path from "path";
import { devWithTimestamp } from "@/utils/logger";
import { deleteMovieMetadata, getCachedMovieMetadata } from "@/lib/movieMetadataCache";
import { parseMovieFilename } from "@/lib/movieCodeParser";
import { getImageCachePath } from "@/utils/paths";

// TODO: 将这些凭据移动到环境变量等更安全的地方
const BITCOMET_URL = "http://192.168.31.36:22072";
const BITCOMET_USERNAME = "admin";
const BITCOMET_PASSWORD = "admin";

export interface BitCometTask {
  id: string;
  name: string;
  files: string[];
}

export class MovieDeletionError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface MovieDeletionResult {
  method: "bitcomet" | "filesystem";
  taskId?: string;
  taskName?: string;
}

export interface BatchDeletionItemResult {
  filePath: string;
  status: "deleted" | "failed";
  method?: "bitcomet" | "filesystem";
  error?: string;
}

/**
 * 获取 BitComet 的基础认证头
 */
function getBitCometAuthHeader(): string {
  const credentials = Buffer.from(`${BITCOMET_USERNAME}:${BITCOMET_PASSWORD}`).toString("base64");
  return `Basic ${credentials}`;
}

/**
 * 获取所有 BitComet 任务
 */
export async function getBitCometTaskList(): Promise<BitCometTask[]> {
  try {
    devWithTimestamp("[BitComet] 获取任务列表...");
    const response = await fetch(`${BITCOMET_URL}/panel/task_list`, {
      headers: {
        Authorization: getBitCometAuthHeader(),
      },
    });

    if (!response.ok) {
      throw new Error(`BitComet task list failed with status: ${response.status}`);
    }

    const html = await response.text();

    // 提取任务 ID - 从 /panel/task_detail?id=XXXX 中获取
    const taskIdRegex = /\/panel\/task_detail\?id=(\d+)/g;
    const matches = [...html.matchAll(taskIdRegex)];
    const taskIds = [...new Set(matches.map((m) => m[1]))];

    devWithTimestamp(`[BitComet] 找到 ${taskIds.length} 个任务`);

    const tasks: BitCometTask[] = [];
    for (const taskId of taskIds) {
      const task = await getBitCometTaskFiles(taskId);
      if (task) {
        tasks.push(task);
      }
    }

    return tasks;
  } catch (error) {
    devWithTimestamp("[BitComet] Error getting task list:", error);
    return [];
  }
}

/**
 * 获取特定任务的文件列表
 */
async function getBitCometTaskFiles(taskId: string): Promise<BitCometTask | null> {
  try {
    const response = await fetch(`${BITCOMET_URL}/panel/task_detail?id=${taskId}&show=files`, {
      headers: {
        Authorization: getBitCometAuthHeader(),
      },
    });

    if (!response.ok) {
      devWithTimestamp(`[BitComet] Failed to get files for task ${taskId}`);
      return null;
    }

    const html = await response.text();

    // 获取任务名称 - 从标题链接中提取
    const nameMatch = html.match(/task_detail\?id=\d+[^>]*>([^<]+)<\/a>/);
    const taskName = nameMatch ? nameMatch[1].trim() : `Task ${taskId}`;

    // 提取文件名 - 从文件表格中获取
    // 格式: <tr><td>Finished</td><td>100%</td><td>filename</td>...
    const fileRows = html.match(/<tr><td>[^<]*<\/td><td>\d+%<\/td><td>([^<]+)<\/td>/g) || [];
    const files = fileRows
      .map((row) => {
        const match = row.match(/<td>([^<]+)<\/td><td>\d+%<\/td><td>([^<]+)<\/td>/);
        return match ? match[2].trim() : null;
      })
      .filter((f): f is string => f !== null);

    devWithTimestamp(`[BitComet] 任务 ${taskId}: ${taskName}, 文件数: ${files.length}`);

    return {
      id: taskId,
      name: taskName,
      files: files,
    };
  } catch (error) {
    devWithTimestamp(`[BitComet] Error getting files for task ${taskId}:`, error);
    return null;
  }
}

/**
 * 根据文件路径在任务列表中查找对应的 BitComet 任务
 */
export function findBitCometTaskByFilePath(filePath: string, tasks: BitCometTask[]): BitCometTask | null {
  const normalizedFilePath = path.normalize(filePath);
  const fileName = path.basename(normalizedFilePath);

  devWithTimestamp(`[BitComet] 查找文件: ${filePath}`);
  devWithTimestamp(`[BitComet] 文件名: ${fileName}`);

  for (const task of tasks) {
    for (const file of task.files) {
      // 比较文件名（不区分大小写）
      if (file.toLowerCase() === fileName.toLowerCase() || file.toLowerCase().includes(fileName.toLowerCase())) {
        devWithTimestamp(`[BitComet] ✓ 找到匹配的任务!`);
        devWithTimestamp(`[BitComet] 任务 ID: ${task.id}, 任务名: ${task.name}, 文件: ${file}`);
        return task;
      }
    }
  }

  devWithTimestamp(`[BitComet] ✗ 未找到匹配的任务`);
  return null;
}

/**
 * 删除 BitComet 任务及其文件
 * action 可选值: 'delete_task' (仅删除任务) 或 'delete_all' (删除任务和文件)
 */
async function deleteBitCometTask(taskId: string, action: "delete_task" | "delete_all" = "delete_all"): Promise<boolean> {
  try {
    devWithTimestamp(`[BitComet] 准备删除任务: ID=${taskId}, action=${action}`);

    const deleteUrl = `${BITCOMET_URL}/panel/task_delete?id=${taskId}&action=${action}`;

    const response = await fetch(deleteUrl, {
      method: "GET",
      headers: {
        Authorization: getBitCometAuthHeader(),
      },
    });

    if (!response.ok) {
      throw new Error(`BitComet delete task failed with status: ${response.status}`);
    }

    const responseText = await response.text();

    // BitComet 返回 XML 格式的响应
    // 检查是否包含成功标记
    if (responseText.includes("ok") || response.status === 200) {
      devWithTimestamp(`[BitComet] ✓ 任务删除成功: ID=${taskId}`);
      return true;
    } else {
      devWithTimestamp(`[BitComet] 删除失败，响应: ${responseText.substring(0, 200)}`);
      return false;
    }
  } catch (error) {
    devWithTimestamp(`[BitComet] Error deleting task ${taskId}:`, error);
    return false;
  }
}

/**
 * 清理电影的关联数据（元数据和封面缓存）
 */
export async function cleanupMovieData(filePath: string) {
  try {
    const fileName = path.basename(filePath);
    const parsedInfo = parseMovieFilename(fileName);

    if (parsedInfo.code) {
      const code = parsedInfo.code;
      devWithTimestamp(`[Deletion] Cleaning up data for code: ${code}`);

      // 1. 获取元数据以查找封面
      const metadata = await getCachedMovieMetadata(code);
      const coverFileName = getCoverCacheFileName(metadata?.coverUrl || null);
      if (coverFileName) {
        // 2. 删除对应的本地封面缓存
        const imageCacheDir = getImageCachePath();
        const coverPath = path.join(imageCacheDir, coverFileName);

        try {
          await fs.unlink(coverPath);
          devWithTimestamp(`[Deletion] Deleted cover image: ${coverPath}`);
        } catch (imgErr: any) {
          if (imgErr.code !== "ENOENT") {
            // 文件不存在是正常情况，不用报错
            devWithTimestamp(`[Deletion] Error deleting cover image ${coverPath}:`, imgErr);
          } else {
            devWithTimestamp(`[Deletion] Cover image not found, skipping delete: ${coverPath}`);
          }
        }
      }

      // 3. 删除元数据记录
      await deleteMovieMetadata(code);
      devWithTimestamp(`[Deletion] Deleted metadata for code: ${code}`);
    }
  } catch (dataErr) {
    devWithTimestamp(`[Deletion] Error during associated data cleanup for ${filePath}:`, dataErr);
    // 这个函数的失败不应该阻止主文件删除的成功响应
  }
}

function getCoverCacheFileName(coverUrl: string | null): string | null {
  if (!coverUrl) {
    return null;
  }

  if (coverUrl.startsWith("/api/image-serve/") || coverUrl.startsWith("/image-cache/")) {
    return path.basename(coverUrl);
  }

  try {
    const urlHash = Buffer.from(coverUrl)
      .toString("base64")
      .replace(/\//g, "_")
      .replace(/\+/g, "-")
      .replace(/=/g, "");

    const ext = path.extname(new URL(coverUrl).pathname);
    const extension = [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext.toLowerCase()) ? ext : ".jpg";

    return `${urlHash}${extension}`;
  } catch {
    return null;
  }
}

/**
 * 删除单个影片文件：
 * - 若文件属于某个 BitComet 任务，则删除任务及其文件
 * - 否则直接从文件系统删除
 * - 成功后清理关联的元数据与封面缓存
 *
 * @param preloadedTasks 可传入已抓取的 BitComet 任务列表，批量删除时避免重复抓取
 */
export async function deleteMovieFile(filePath: string, preloadedTasks?: BitCometTask[]): Promise<MovieDeletionResult> {
  const tasks = preloadedTasks ?? (await getBitCometTaskList());
  const task = findBitCometTaskByFilePath(filePath, tasks);

  if (task) {
    devWithTimestamp(`[Deletion] 文件是 BitComet 任务的一部分，删除任务及文件: ID=${task.id}`);
    const deleteSuccess = await deleteBitCometTask(task.id, "delete_all");
    if (!deleteSuccess) {
      throw new MovieDeletionError("BitComet 任务删除失败", 500);
    }
    await cleanupMovieData(filePath);
    return { method: "bitcomet", taskId: task.id, taskName: task.name };
  }

  devWithTimestamp(`[Deletion] 文件不是 BitComet 任务，准备从文件系统删除: ${filePath}`);

  try {
    await fs.access(filePath);
  } catch {
    throw new MovieDeletionError("文件不存在或无法访问", 404);
  }

  await fs.unlink(filePath);
  devWithTimestamp(`[Deletion] 文件删除成功: ${filePath}`);

  await cleanupMovieData(filePath);
  return { method: "filesystem" };
}

/**
 * 批量删除影片文件。BitComet 任务列表只抓取一次；
 * 单个文件失败不中断整体，逐文件返回结果。
 */
export async function deleteMovieFiles(filePaths: string[]): Promise<BatchDeletionItemResult[]> {
  const tasks = await getBitCometTaskList();
  const deletedTaskIds = new Set<string>();
  const results: BatchDeletionItemResult[] = [];

  for (const filePath of filePaths) {
    try {
      const result = await deleteMovieFile(filePath, tasks);
      if (result.taskId) {
        deletedTaskIds.add(result.taskId);
      }
      results.push({ filePath, status: "deleted", method: result.method });
    } catch (error) {
      // 同一 BitComet 多文件任务随第一个文件删除后，其余文件已不存在：
      // 这类"文件已随任务删除"的情况按成功处理。
      const matchedTask = findBitCometTaskByFilePath(filePath, tasks);
      if (
        error instanceof MovieDeletionError &&
        error.status === 404 &&
        matchedTask &&
        deletedTaskIds.has(matchedTask.id)
      ) {
        devWithTimestamp(`[Deletion] 文件已随任务 ${matchedTask.id} 删除: ${filePath}`);
        await cleanupMovieData(filePath);
        results.push({ filePath, status: "deleted", method: "bitcomet" });
        continue;
      }

      const message = error instanceof Error ? error.message : String(error);
      devWithTimestamp(`[Deletion] 批量删除失败: ${filePath}`, error);
      results.push({ filePath, status: "failed", error: message });
    }
  }

  return results;
}
