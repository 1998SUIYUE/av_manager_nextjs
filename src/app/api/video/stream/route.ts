import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import stream from 'stream';
import { devWithTimestamp } from '@/utils/logger';

function createSafeReadableStream(fileStream: fs.ReadStream, logPrefix: string): ReadableStream<Uint8Array> {
  let controllerClosed = false;
  
  return new ReadableStream({
    start(controller) {
      const webStream = stream.Readable.toWeb(fileStream);
      const reader = webStream.getReader();
      
      function pump(): Promise<void> {
        return reader.read().then(({ done, value }) => {
          if (done) {
            if (!controllerClosed) {
              try {
                controller.close();
                controllerClosed = true;
              } catch (error) {
                if (error instanceof Error && !error.message.includes('already closed')) {
                  devWithTimestamp(`${logPrefix} Error closing stream controller:`, error);
                }
              }
            }
            return;
          }
          
          if (!controllerClosed) {
            try {
              controller.enqueue(value);
              return pump();
            } catch (error) {
              if (error instanceof Error && !error.message.includes('already closed')) {
                devWithTimestamp(`${logPrefix} Error enqueuing data:`, error);
                if (!controllerClosed) {
                  try {
                    controller.error(error);
                    controllerClosed = true;
                  } catch (controllerError) {
                    devWithTimestamp(`Controller error: ${controllerError}`);
                  }
                }
              }
              return Promise.resolve();
            }
          }
          return Promise.resolve();
        }).catch((error) => {
          if (!controllerClosed) {
            try {
              controller.error(error);
              controllerClosed = true;
            } catch (controllerError) {
              if (controllerError instanceof Error && !controllerError.message.includes('already closed')) {
                devWithTimestamp(`${logPrefix} Error in controller.error:`, controllerError);
              }
            }
          }
        });
      }
      
      return pump();
    },
    cancel() {
      controllerClosed = true;
      fileStream.destroy();
    }
  });
}

const SUPPORTED_VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];

export async function GET(
  request: NextRequest
) {
  const requestStart = Date.now();
  devWithTimestamp('[video API] 🎬 收到视频流请求');
  
  const userAgent = request.headers.get('user-agent') || 'Unknown';
  const referer = request.headers.get('referer') || 'Direct';
  devWithTimestamp(`[video API] 📱 User-Agent: ${userAgent.substring(0, 100)}...`);
  devWithTimestamp(`[video API] 🔗 Referer: ${referer}`);

  try {
    // 从查询参数获取文件路径
    const searchParams = request.nextUrl.searchParams;
    const encodedPath = searchParams.get('path');

    if (!encodedPath) {
      devWithTimestamp('[video API] Missing file path in query parameters.');
      return new NextResponse('缺少文件路径', { status: 400 });
    }

    // 安全解码路径，支持中文字符
    let absolutePath: string;
    try {
      const base64Decoded = Buffer.from(encodedPath, 'base64').toString('utf8');
      absolutePath = decodeURIComponent(base64Decoded);
      devWithTimestamp(`[video API] Safe decoded path: ${absolutePath}`);
    } catch (error) {
      try {
        absolutePath = decodeURIComponent(encodedPath);
        devWithTimestamp(`[video API] URI decoded path: ${absolutePath}`);
      } catch (fallbackError) {
        absolutePath = Buffer.from(encodedPath, 'base64').toString('utf8');
        devWithTimestamp(`[video API] Legacy base64 decoded path: ${absolutePath}`);
      }
    }

    // 将路径中的所有反斜杠替换为正斜杠，以确保跨平台兼容性 (Windows 路径)
    absolutePath = absolutePath.replace(/\\/g, '/');
    devWithTimestamp(`[video API] Path normalized to forward slashes: ${absolutePath}`);

    // 检查文件是否存在
    if (!fs.existsSync(absolutePath)) {
      devWithTimestamp(`[video API] File not found: ${absolutePath}`);
      return new NextResponse('文件未找到', { status: 404 });
    }

    const stats = fs.statSync(absolutePath);
    const fileSize = stats.size;
    const fileExt = path.extname(absolutePath).toLowerCase();
    
    if (!SUPPORTED_VIDEO_EXTENSIONS.includes(fileExt)) {
      return new NextResponse('不支持的视频格式', { status: 415 });
    }
    
    devWithTimestamp(`[video API] File: ${path.basename(absolutePath)}, Size: ${fileSize}, Path: ${absolutePath}`);
    
    // 解析 range 请求头
    const range = request.headers.get('range');
    devWithTimestamp(`[video API] 📥 Range header: ${range || 'No Range header'}`);
    
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const requestedEnd = parts[1] ? parseInt(parts[1], 10) : undefined;
      
      const maxChunkSize = 16 * 1024 * 1024; // 16MB 单次传输窗口
      const requestedEndForLog = requestedEnd ?? fileSize - 1;
      const requestedSize = requestedEndForLog - start + 1;
      const actualEnd = Math.min(
        requestedEnd ?? start + maxChunkSize - 1,
        start + maxChunkSize - 1,
        fileSize - 1
      );
      
      devWithTimestamp(`[video API] 📊 原始请求: ${start}-${requestedEndForLog} (${(requestedSize / 1024 / 1024).toFixed(2)}MB)`);
      devWithTimestamp(`[video API] 📊 文件总大小: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);
      devWithTimestamp(`[video API] 返回范围: ${start}-${actualEnd}`);
      
      const chunksize = (actualEnd - start) + 1;
      devWithTimestamp(`[video API] 📤 最终传输数据量: ${(chunksize / 1024 / 1024).toFixed(2)}MB`);
      const headers = new Headers({
        'Content-Range': `bytes ${start}-${actualEnd}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize.toString(),
        'Content-Type': getContentType(fileExt),
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400, immutable'
      });
      
      const fileStream = fs.createReadStream(absolutePath, {
        start,
        end: actualEnd,
        highWaterMark: 1024 * 1024,
      });
      
      fileStream.on('error', (error) => {
        devWithTimestamp(`[video API] File stream error for range ${start}-${actualEnd}:`, error);
      });
      
      const safeWebStream = createSafeReadableStream(fileStream, `[video API Range ${start}-${actualEnd}]`);

      const responseTime = Date.now() - requestStart;
      const transferSpeedMBps = (chunksize / 1024 / 1024) / (responseTime / 1000);
      
      devWithTimestamp(`[video API] 🚀 返回部分内容: ${path.basename(absolutePath)}`);
      devWithTimestamp(`[video API] ⏱️ 响应时间: ${responseTime}ms`);
      devWithTimestamp(`[video API] 🏃 理论传输速度: ${transferSpeedMBps.toFixed(2)}MB/s`);
      devWithTimestamp(`[video API] 📋 Content-Range: bytes ${start}-${actualEnd}/${fileSize}`);
      
      return new NextResponse(safeWebStream, { 
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
      
      const fileStream = fs.createReadStream(absolutePath, {
        highWaterMark: 1024 * 1024,
      });
      
      fileStream.on('error', (error) => {
        devWithTimestamp(`[video API] File stream error for full content:`, error);
      });
      
      const safeWebStream = createSafeReadableStream(fileStream, '[video API Full Content]');

      devWithTimestamp(`[video API] Serving full content: ${absolutePath}`);
      return new NextResponse(safeWebStream, { 
        status: 200, 
        headers 
      });
    }
  } catch (error: unknown) {
    devWithTimestamp('[video API] Video streaming error:', error);
    return new NextResponse(`处理视频时发生错误: ${error instanceof Error ? error.message : String(error)}`, { status: 500 });
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
