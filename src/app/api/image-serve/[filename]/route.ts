import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { devWithTimestamp } from '@/utils/logger';
import { getImageCachePath } from '@/utils/paths';

// 图片缓存目录
const CACHE_DIR = getImageCachePath();

// 根据文件扩展名获取MIME类型
function getContentType(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'image/jpeg';
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    // devWithTimestamp(`[image-serve] 请求图片: ${filename}`);
    
    // 构建文件路径
    const filePath = path.join(CACHE_DIR, filename);
    
    // 检查文件是否存在
    try {
      await fs.access(filePath);
    } catch {
      // devWithTimestamp(`[image-serve] 文件不存在: ${filePath}`);
      return new NextResponse('图片不存在', { status: 404 });
    }
    
    // 读取文件
    const imageBuffer = await fs.readFile(filePath);
    const extension = path.extname(filename);
    
    // devWithTimestamp(`[image-serve] 成功读取图片: ${filename}, 大小: ${imageBuffer.length} 字节`);
    
    // 返回图片内容
    const headers = new Headers({
      'Content-Type': getContentType(extension),
      'Content-Length': imageBuffer.length.toString(),
      'Cache-Control': 'public, max-age=86400', // 缓存1天
    });
    
    return new NextResponse(imageBuffer, {
      status: 200,
      headers,
    });
  } catch (error) {
    // devWithTimestamp('[image-serve] 服务图片时发生错误:', error);
    return new NextResponse('服务器错误', { status: 500 });
  }
}