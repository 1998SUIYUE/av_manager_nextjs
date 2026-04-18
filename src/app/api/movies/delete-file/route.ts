import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { devWithTimestamp } from '@/utils/logger';

// TODO: 将这些凭据移动到环境变量等更安全的地方
const BITCOMET_URL = 'http://192.168.31.36:22072';
const BITCOMET_USERNAME = 'admin';
const BITCOMET_PASSWORD = 'admin';

interface BitCometTask {
  id: string;
  name: string;
  files: string[];
}

/**
 * 获取 BitComet 的基础认证头
 */
function getBitCometAuthHeader(): string {
  const credentials = Buffer.from(`${BITCOMET_USERNAME}:${BITCOMET_PASSWORD}`).toString('base64');
  return `Basic ${credentials}`;
}

/**
 * 获取所有 BitComet 任务
 */
async function getBitCometTaskList(): Promise<BitCometTask[]> {
  try {
    devWithTimestamp('[BitComet] 获取任务列表...');
    const response = await fetch(`${BITCOMET_URL}/panel/task_list`, {
      headers: {
        'Authorization': getBitCometAuthHeader(),
      },
    });

    if (!response.ok) {
      throw new Error(`BitComet task list failed with status: ${response.status}`);
    }

    const html = await response.text();
    
    // 提取任务 ID - 从 /panel/task_detail?id=XXXX 中获取
    const taskIdRegex = /\/panel\/task_detail\?id=(\d+)/g;
    const matches = [...html.matchAll(taskIdRegex)];
    const taskIds = [...new Set(matches.map(m => m[1]))];

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
    devWithTimestamp('[BitComet] Error getting task list:', error);
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
        'Authorization': getBitCometAuthHeader(),
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
    const files = fileRows.map(row => {
      const match = row.match(/<td>([^<]+)<\/td><td>\d+%<\/td><td>([^<]+)<\/td>/);
      return match ? match[2].trim() : null;
    }).filter((f): f is string => f !== null);

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
 * 根据文件路径查找对应的 BitComet 任务
 */
async function findBitCometTaskByFilePath(filePath: string): Promise<BitCometTask | null> {
  try {
    const normalizedFilePath = path.normalize(filePath);
    const fileName = path.basename(normalizedFilePath);

    devWithTimestamp(`[BitComet] 查找文件: ${filePath}`);
    devWithTimestamp(`[BitComet] 文件名: ${fileName}`);

    const tasks = await getBitCometTaskList();

    for (const task of tasks) {
      for (const file of task.files) {
        // 比较文件名（不区分大小写）
        if (file.toLowerCase() === fileName.toLowerCase() || 
            file.toLowerCase().includes(fileName.toLowerCase())) {
          devWithTimestamp(`[BitComet] ✓ 找到匹配的任务!`);
          devWithTimestamp(`[BitComet] 任务 ID: ${task.id}, 任务名: ${task.name}, 文件: ${file}`);
          return task;
        }
      }
    }

    devWithTimestamp(`[BitComet] ✗ 未找到匹配的任务`);
    return null;
  } catch (error) {
    devWithTimestamp('[BitComet] Error finding task by file path:', error);
    return null;
  }
}

/**
 * 删除 BitComet 任务及其文件
 * action 可选值: 'delete_task' (仅删除任务) 或 'delete_all' (删除任务和文件)
 */
async function deleteBitCometTask(taskId: string, action: 'delete_task' | 'delete_all' = 'delete_all'): Promise<boolean> {
  try {
    devWithTimestamp(`[BitComet] 准备删除任务: ID=${taskId}, action=${action}`);

    const deleteUrl = `${BITCOMET_URL}/panel/task_delete?id=${taskId}&action=${action}`;
    
    const response = await fetch(deleteUrl, {
      method: 'GET',
      headers: {
        'Authorization': getBitCometAuthHeader(),
      },
    });

    if (!response.ok) {
      throw new Error(`BitComet delete task failed with status: ${response.status}`);
    }

    const responseText = await response.text();
    
    // BitComet 返回 XML 格式的响应
    // 检查是否包含成功标记
    if (responseText.includes('ok') || response.status === 200) {
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

export async function DELETE(request: Request) {
  try {
    const { filePath } = await request.json();

    if (!filePath) {
      devWithTimestamp("[API - DELETE] 未提供文件路径");
      return NextResponse.json({ error: '未提供文件路径' }, { status: 400 });
    }

    devWithTimestamp(`[API - DELETE] 尝试删除文件: ${filePath}`);

    const decodedFilePath = decodeURIComponent(filePath);
    devWithTimestamp(`[API - DELETE] 解码后的文件路径: ${decodedFilePath}`);

    // 在删除文件前，先检查它是否是 BitComet 任务
    const task = await findBitCometTaskByFilePath(decodedFilePath);

    if (task) {
      // 找到匹配的 BitComet 任务，准备删除
      devWithTimestamp(`[API - DELETE] 文件是 BitComet 任务的一部分。`);
      devWithTimestamp(`[API - DELETE] 找到匹配任务: Name=${task.name}, ID=${task.id}`);

      try {
        // 调用 BitComet API 删除任务和文件
        const deleteSuccess = await deleteBitCometTask(task.id, 'delete_all');

        if (deleteSuccess) {
          devWithTimestamp(`[API - DELETE] BitComet 任务及文件删除成功`);
          return NextResponse.json({
            message: 'BitComet 任务及对应文件删除成功',
            task: {
              id: task.id,
              name: task.name,
            },
            status: 'deleted',
          });
        } else {
          devWithTimestamp(`[API - DELETE] BitComet 任务删除失败`);
          return NextResponse.json(
            { error: 'BitComet 任务删除失败' },
            { status: 500 }
          );
        }
      } catch (e) {
        devWithTimestamp('[API - DELETE] 调用 BitComet 删除 API 时发生错误:', e);
        return NextResponse.json(
          { error: '调用 BitComet 删除 API 时发生错误' },
          { status: 500 }
        );
      }
    }

    devWithTimestamp(`[API - DELETE] 文件不是 BitComet 任务，准备从文件系统删除。`);

    // 检查文件是否存在
    try {
      await fs.access(decodedFilePath);
    } catch (err) {
      devWithTimestamp(`[API - DELETE] 文件不存在或无法访问: ${decodedFilePath}`, err);
      return NextResponse.json({ error: '文件不存在或无法访问' }, { status: 404 });
    }

    // 删除文件
    await fs.unlink(decodedFilePath);
    devWithTimestamp(`[API - DELETE] 文件删除成功: ${decodedFilePath}`);

    return NextResponse.json({ message: '文件删除成功' });
  } catch (error) {
    devWithTimestamp("[API - DELETE] 删除文件时发生错误:", error);
    return NextResponse.json({ error: '删除文件时发生错误' }, { status: 500 });
  }
}