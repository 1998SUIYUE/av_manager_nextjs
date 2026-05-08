import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import stream from 'stream'; // 导入 stream 模块
import { devWithTimestamp } from '@/utils/logger'; // 导入日志工具

// 创建安全的 ReadableStream 包装器，防止控制器重复关闭错误
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
                // 忽略重复关闭错误
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
                    devWithTimestamp("发生"+controllerError)
                    // 忽略控制器已关闭的错误
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
              // 忽略控制器已关闭的错误
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
      // 清理资源
      controllerClosed = true;
      fileStream.destroy();
    }
  });
}

// 支持的视频文件扩展名
const SUPPORTED_VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];

export async function GET(
  request: NextRequest
) {
  const requestStart = Date.now();
  devWithTimestamp('[video API] 🎬 收到视频流请求'); // 添加日志
  
  // 打印请求头信息
  const userAgent = request.headers.get('user-agent') || 'Unknown';
  const referer = request.headers.get('referer') || 'Direct';
  devWithTimestamp(`[video API] 📱 User-Agent: ${userAgent.substring(0, 100)}...`);
  devWithTimestamp(`[video API] 🔗 Referer: ${referer}`);
  

  const streamErrorHandler = (error: Error) => {
    if (error.message.includes('Controller is already closed') || 
        error.message.includes('already closed')
        ) {
      // 静默处理流控制器错误，只记录到日志
      devWithTimestamp(`[video API] Handled stream controller error: ${error.message}`);
      return; // 不让错误继续传播
    }
    // 其他错误继续正常处理
    devWithTimestamp('[video API] Uncaught exception:', error);
  };
  
  process.on('uncaughtException', streamErrorHandler);
  
  // 确保在请求结束时清理处理器
  const cleanup = () => {
    process.removeListener('uncaughtException', streamErrorHandler);
  };
  
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
      // 首先尝试新的编码方式：先base64解码，再URI解码
      const base64Decoded = Buffer.from(encodedPath, 'base64').toString('utf8');
      absolutePath = decodeURIComponent(base64Decoded);
      devWithTimestamp(`[video API] Safe decoded path: ${absolutePath}`);
    } catch (error) {
      try {
        // 如果失败，尝试直接URI解码（备选方案）
        absolutePath = decodeURIComponent(encodedPath);
        devWithTimestamp(`[video API] URI decoded path: ${absolutePath}`);
      } catch (fallbackError) {
        // 最后尝试原始的base64解码（向后兼容）
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

    const fileExt = path.extname(absolutePath).toLowerCase();

    // 检查文件扩展名（忽略大小写）
    if (!SUPPORTED_VIDEO_EXTENSIONS.includes(fileExt)) {
      devWithTimestamp(`[video API] Unsupported video file type: ${fileExt} for path: ${absolutePath}`);
      return new NextResponse('不支持的视频文件类型', { status: 415 });
    }

    // 检查文件是否可读
    try {
      fs.accessSync(absolutePath, fs.constants.R_OK);
      devWithTimestamp(`[video API] File is readable: ${absolutePath}`);
    } catch (accessError) {
      devWithTimestamp('[video API] File access denied:', { filePath: absolutePath, error: accessError });
      return new NextResponse('无法访问文件', { status: 403 });
    }

    // 获取文件状态
    const stat = fs.statSync(absolutePath);
    const fileSize = stat.size;
    devWithTimestamp(`[video API] File size: ${fileSize}, Path: ${absolutePath}`);
    
    // 解析 range 请求头
    const range = request.headers.get('range');
    devWithTimestamp(`[video API] 📥 Range header: ${range || 'No Range header'}`);
    
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const requestedEnd = parts[1] ? parseInt(parts[1], 10) : undefined;
      
      // 4K/大文件播放时，不要把浏览器的 Range 请求扩成超大块。
      // Chrome/Edge 会根据解码和缓冲情况主动调整 range，服务端只需要给一个
      // 稳定的小窗口即可；过大的 100MB/500MB 单块会占用 IO、内存和主线程调度。
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
        'Cache-Control': 'public, max-age=86400, immutable' // 🚀 添加 immutable 提升缓存
      });
      
      // 创建文件流并添加错误处理
      const fileStream = fs.createReadStream(absolutePath, {
        start,
        end: actualEnd,
        highWaterMark: 1024 * 1024,
      });
      
      // 添加错误处理，防止流被意外关闭
      fileStream.on('error', (error) => {
        devWithTimestamp(`[video API] File stream error for range ${start}-${actualEnd}:`, error);
      });
      
      // 使用安全的 ReadableStream 包装器
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
      
      // 创建文件流并添加错误处理
      const fileStream = fs.createReadStream(absolutePath, {
        highWaterMark: 1024 * 1024,
      });
      
      // 添加错误处理
      fileStream.on('error', (error) => {
        devWithTimestamp(`[video API] File stream error for full content:`, error);
      });
      
      // 使用安全的 ReadableStream 包装器
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
  } finally {
    // 清理未捕获异常处理器
    cleanup();
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
