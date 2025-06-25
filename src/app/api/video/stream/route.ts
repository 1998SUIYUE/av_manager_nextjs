import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import stream from 'stream'; // 导入 stream 模块
import { logWithTimestamp, errorWithTimestamp } from '@/utils/logger'; // 导入日志工具

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
                  errorWithTimestamp(`${logPrefix} Error closing stream controller:`, error);
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
                errorWithTimestamp(`${logPrefix} Error enqueuing data:`, error);
                if (!controllerClosed) {
                  try {
                    controller.error(error);
                    controllerClosed = true;
                  } catch (controllerError) {
                    logWithTimestamp("发生"+controllerError)
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
                errorWithTimestamp(`${logPrefix} Error in controller.error:`, controllerError);
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
  logWithTimestamp('[video API] Received video stream request.'); // 添加日志
  

  const streamErrorHandler = (error: Error) => {
    if (error.message.includes('Controller is already closed') || 
        error.message.includes('already closed')
        ) {
      // 静默处理流控制器错误，只记录到日志
      logWithTimestamp(`[video API] Handled stream controller error: ${error.message}`);
      return; // 不让错误继续传播
    }
    // 其他错误继续正常处理
    errorWithTimestamp('[video API] Uncaught exception:', error);
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
      errorWithTimestamp('[video API] Missing file path in query parameters.');
      return new NextResponse('缺少文件路径', { status: 400 });
    }

    // 解码并处理路径 (Base64 解码)
    let absolutePath = Buffer.from(encodedPath, 'base64').toString('utf8');
    logWithTimestamp(`[video API] Base64 decoded path: ${absolutePath}`);

    // 将路径中的所有反斜杠替换为正斜杠，以确保跨平台兼容性 (Windows 路径)
    absolutePath = absolutePath.replace(/\\/g, '/');
    logWithTimestamp(`[video API] Path normalized to forward slashes: ${absolutePath}`);

    // 检查文件是否存在
    if (!fs.existsSync(absolutePath)) {
      errorWithTimestamp(`[video API] File not found: ${absolutePath}`);
      return new NextResponse('文件未找到', { status: 404 });
    }

    const fileExt = path.extname(absolutePath).toLowerCase();

    // 检查文件扩展名（忽略大小写）
    if (!SUPPORTED_VIDEO_EXTENSIONS.includes(fileExt)) {
      errorWithTimestamp(`[video API] Unsupported video file type: ${fileExt} for path: ${absolutePath}`);
      return new NextResponse('不支持的视频文件类型', { status: 415 });
    }

    // 检查文件是否可读
    try {
      fs.accessSync(absolutePath, fs.constants.R_OK);
      logWithTimestamp(`[video API] File is readable: ${absolutePath}`);
    } catch (accessError) {
      errorWithTimestamp('[video API] File access denied:', { filePath: absolutePath, error: accessError });
      return new NextResponse('无法访问文件', { status: 403 });
    }

    // 获取文件状态
    const stat = fs.statSync(absolutePath);
    const fileSize = stat.size;
    logWithTimestamp(`[video API] File size: ${fileSize}, Path: ${absolutePath}`);
    
    // 解析 range 请求头
    const range = request.headers.get('range');
    
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
      
      // 创建文件流并添加错误处理
      const fileStream = fs.createReadStream(absolutePath, { start, end });
      
      // 添加错误处理，防止流被意外关闭
      fileStream.on('error', (error) => {
        errorWithTimestamp(`[video API] File stream error for range ${start}-${end}:`, error);
      });
      
      // 使用安全的 ReadableStream 包装器
      const safeWebStream = createSafeReadableStream(fileStream, `[video API Range ${start}-${end}]`);

      logWithTimestamp(`[video API] Serving partial content: ${absolutePath}, Range: ${start}-${end}`);
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
      const fileStream = fs.createReadStream(absolutePath);
      
      // 添加错误处理
      fileStream.on('error', (error) => {
        errorWithTimestamp(`[video API] File stream error for full content:`, error);
      });
      
      // 使用安全的 ReadableStream 包装器
      const safeWebStream = createSafeReadableStream(fileStream, '[video API Full Content]');

      logWithTimestamp(`[video API] Serving full content: ${absolutePath}`);
      return new NextResponse(safeWebStream, { 
        status: 200, 
        headers 
      });
    }
  } catch (error: unknown) {
    errorWithTimestamp('[video API] Video streaming error:', error);
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