import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { devWithTimestamp } from '@/utils/logger';

// TODO: 将这些凭据移动到环境变量等更安全的地方
const QB_URL = 'http://localhost:8080';
const QB_USERNAME = 'admin';
const QB_PASSWORD = '123456';

let authCookie = '';

async function loginToQb() {
  if (authCookie) return;

  try {
    const response = await fetch(`${QB_URL}/api/v2/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `username=${QB_USERNAME}&password=${QB_PASSWORD}`,
    });

    if (!response.ok) {
      throw new Error(`qBittorrent login failed with status: ${response.status}`);
    }

    const cookie = response.headers.get('set-cookie');
    if (!cookie) {
      throw new Error('qBittorrent login did not return a cookie.');
    }
    authCookie = cookie;
    devWithTimestamp('[qB] Login successful.');
  } catch (error) {
    devWithTimestamp('[qB] qBittorrent login error:', error);
    authCookie = ''; // Reset cookie on error
    throw error; // Re-throw to be caught by the main handler
  }
}

async function findTorrentByFilePath(filePath: string) {
  try {
    await loginToQb();

    const torrentsResponse = await fetch(`${QB_URL}/api/v2/torrents/info`, {
      headers: { Cookie: authCookie },
    });
    if (!torrentsResponse.ok) throw new Error('Failed to get torrents list.');
    const torrents = await torrentsResponse.json();

    const normalizedFilePath = path.normalize(filePath);

    for (const torrent of torrents) {
      const filesResponse = await fetch(`${QB_URL}/api/v2/torrents/files?hash=${torrent.hash}`, {
        headers: { Cookie: authCookie },
      });
      if (!filesResponse.ok) {
        devWithTimestamp(`[qB] Failed to get files for torrent: ${torrent.name}`);
        continue;
      }
      const files = await filesResponse.json();
      const savePath = torrent.save_path;

      for (const file of files) {
        const fullPath = path.join(savePath, file.name);
        const normalizedFullPath = path.normalize(fullPath);

        // 调试日志：打印正在比较的两个路径
        devWithTimestamp(`[qB] Comparing: [${normalizedFullPath}] vs [${normalizedFilePath}]`);

        // 路径规范化并转为小写以进行不区分大小写的比较
        if (normalizedFullPath.toLowerCase() === normalizedFilePath.toLowerCase()) {
          return torrent; // 找到匹配的 torrent
        }
      }
    }
  } catch (error) {
    devWithTimestamp('[qB] Error communicating with qBittorrent:', error);
    // 如果与 qB 的通信失败，我们假装没有找到任务，让后续的文件删除逻辑继续
    // 这样即便是 qB 服务挂了，也不影响基本的文件删除功能
    return null;
  }

  return null; // 未找到
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

    // 在删除文件前，先检查它是否是 qB 任务
    const torrent = await findTorrentByFilePath(decodedFilePath);

    if (torrent) {
      // 测试模式：找到任务，只打印日志，不删除
      devWithTimestamp(`[API - DELETE] 文件是 qB 任务的一部分。测试模式下不删除。`);
      devWithTimestamp(`[qB] 找到匹配任务: Name=${torrent.name}, Hash=${torrent.hash}`);
      return NextResponse.json({
        message: '找到匹配的 qB 任务，测试模式下不执行删除操作。',
        torrentInfo: {
          name: torrent.name,
          hash: torrent.hash,
        },
      });
    }

    devWithTimestamp(`[API - DELETE] 文件不是 qB 任务，准备从文件系统删除。`);

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