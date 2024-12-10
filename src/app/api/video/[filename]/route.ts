import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';


// 支持的视频文件扩展名
const SUPPORTED_VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];

export async function GET(
  request: NextRequest
) {
  try {
    // 从查询参数获取文件路径
    const searchParams = request.nextUrl.searchParams;
    const encodedPath = searchParams.get('path');

    if (!encodedPath) {
      return new NextResponse('缺少文件路径', { status: 400 });
    }

    // 解码并处理路径
    const absolutePath = decodeURIComponent(encodedPath).replace(/\\/g, '/');
    
    // console.log('收到视频请求:', {
    //   encodedPath,
    //   absolutePath
    // });

    // 检查文件是否存在
    if (!fs.existsSync(absolutePath)) {
      console.error(`文件未找到: ${absolutePath}`);
      return new NextResponse('文件未找到', { status: 404 });
    }

    const fileExt = path.extname(absolutePath).toLowerCase();

    // 检查文件扩展名（忽略大小写）
    if (!SUPPORTED_VIDEO_EXTENSIONS.includes(fileExt)) {
      return new NextResponse('不支持的视频文件类型', { status: 415 });
    }

    // 检查文件是否可读
    try {
      fs.accessSync(absolutePath, fs.constants.R_OK);
    } catch (accessError) {
      console.error('文件无法访问:', {
        filePath: absolutePath,
        error: accessError
      });
      return new NextResponse('无法访问文件', { status: 403 });
    }

    // 获取文件状态
    const stat = fs.statSync(absolutePath);
    const fileSize = stat.size;
    
    // 解析 range 请求头
    const range = request.headers.get('range');
    
    // console.log('文件范围请求:', {
    //   range,
    //   fileSize
    // });

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      
      const chunksize = (end - start) + 1;
      const headers = new Headers({
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize.toString(),
        'Content-Type': getContentType(fileExt),
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400'
      });
      
      const fileStream = fs.createReadStream(absolutePath, { start, end });
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new NextResponse(fileStream as any, { 
        status: 206, 
        headers 
      });
    } else {
      // 如果没有 range 请求，返回整个文件
      const headers = new Headers({
        'Content-Length': fileSize.toString(),
        'Content-Type': getContentType(fileExt),
        'Content-Disposition': `inline; filename="${path.basename(absolutePath)}"`,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400'
      });
      
      const fileStream = fs.createReadStream(absolutePath);
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new NextResponse(fileStream as any, { 
        status: 200, 
        headers 
      });
    }
  } catch (error) {
    console.error('视频流媒体错误:', error);
    return new NextResponse('处理视频时发生错误', { status: 500 });
  }
}

// 根据文件扩展名获取 MIME 类型
function getContentType(ext: string): string {
  switch (ext) {
    case '.mp4':
      return 'video/mp4';
    case '.mkv':
      return 'video/x-matroska';
    case '.avi':
      return 'video/x-msvideo';
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    default:
      return 'application/octet-stream';
  }
}
