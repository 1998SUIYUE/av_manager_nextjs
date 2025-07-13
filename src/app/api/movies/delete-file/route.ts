import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { devWithTimestamp } from '@/utils/logger';

export async function DELETE(request: Request) {
  try {
    const { filePath } = await request.json();

    if (!filePath) {
      devWithTimestamp("[API - DELETE /api/movies/delete-file] 未提供文件路径");
      return NextResponse.json({ error: '未提供文件路径' }, { status: 400 });
    }

    devWithTimestamp(`[API - DELETE /api/movies/delete-file] 尝试删除文件: ${filePath}`);

    // 确保文件路径是安全的，防止路径遍历攻击
    // 通常，您应该有一个已知安全的基础目录来限制删除操作
    // 这里假设filePath是绝对路径，并且在服务器控制的范围内
    // 实际生产环境应有更严格的路径验证
    const decodedFilePath = decodeURIComponent(filePath);
    devWithTimestamp(`[API - DELETE /api/movies/delete-file] 解码后的文件路径: ${decodedFilePath}`);

    // 检查文件是否存在
    try {
      await fs.access(decodedFilePath);
    } catch (err) {
      devWithTimestamp(`[API - DELETE /api/movies/delete-file] 文件不存在或无法访问: ${decodedFilePath}`, err);
      return NextResponse.json({ error: '文件不存在或无法访问' }, { status: 404 });
    }

    // 删除文件
    await fs.unlink(decodedFilePath);
    devWithTimestamp(`[API - DELETE /api/movies/delete-file] 文件删除成功: ${decodedFilePath}`);

    return NextResponse.json({ message: '文件删除成功' });
  } catch (error) {
    devWithTimestamp("[API - DELETE /api/movies/delete-file] 删除文件时发生错误:", error);
    return NextResponse.json({ error: '删除文件时发生错误' }, { status: 500 });
  }
} 