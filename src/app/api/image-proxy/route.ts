import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { logWithTimestamp, warnWithTimestamp, errorWithTimestamp } from '@/utils/logger';

// 图片缓存目录
const CACHE_DIR = path.join(process.cwd(), 'public', 'image-cache');

// 支持的图片类型
const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

// 确保缓存目录存在
async function ensureCacheDir() {
  logWithTimestamp('[ensureCacheDir] 检查或创建图片缓存目录...');
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    logWithTimestamp(`[ensureCacheDir] 缓存目录 '${CACHE_DIR}' 已存在或创建成功。`);
  } catch (error: unknown) {
    errorWithTimestamp('[ensureCacheDir] 创建缓存目录失败:', error);
  }
}

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
    default:
      return 'image/jpeg';
  }
}

// 生成缓存文件名
function getCacheFileName(url: string): string {
  // 将URL转换为安全的文件名
  const urlHash = Buffer.from(url).toString('base64')
    .replace(/\//g, '_')
    .replace(/\+/g, '-')
    .replace(/=/g, '');
  
  // 提取文件扩展名
  let extension = path.extname(new URL(url).pathname);
  
  // 检查是否是支持的扩展名，如果不是则默认为.jpg
  if (!extension || !SUPPORTED_IMAGE_EXTENSIONS.includes(extension.toLowerCase())) {
    extension = '.jpg';
  }
  
  return `${urlHash}${extension}`;
}

export async function GET(request: NextRequest) {
  logWithTimestamp('[image-proxy/GET] 收到图片代理请求');
  try {
    await ensureCacheDir();
    
    // 获取URL参数
    const searchParams = request.nextUrl.searchParams;
    const imageUrl = searchParams.get('url');
    const direct = searchParams.get('direct') === 'true';
    
    if (!imageUrl) {
      warnWithTimestamp('[image-proxy/GET] 缺少图片URL参数，返回 400');
      return new NextResponse('缺少图片URL参数', { status: 400 });
    }
    logWithTimestamp(`[image-proxy/GET] 请求的图片URL: ${imageUrl}, direct模式: ${direct}`);
    
    // 缓存文件路径
    const cacheFileName = getCacheFileName(imageUrl);
    const cachePath = path.join(CACHE_DIR, cacheFileName);
    const publicPath = `/image-cache/${cacheFileName}`;
    logWithTimestamp(`[image-proxy/GET] 缓存文件路径: ${cachePath}, 公共路径: ${publicPath}`);
    
    let imageBuffer: Buffer;
    let extension: string;
    
    // 检查缓存是否存在
    try {
      logWithTimestamp(`[image-proxy/GET] 尝试从缓存读取: ${cachePath}`);
      await fs.access(cachePath);
      // 缓存存在
      extension = path.extname(cachePath);
      logWithTimestamp(`[image-proxy/GET] 缓存命中，从本地读取图片: ${cachePath}`);
      
      if (direct) {
        // 如果请求直接返回图片内容
        imageBuffer = await fs.readFile(cachePath);
        logWithTimestamp('[image-proxy/GET] direct模式: 从缓存直接返回图片内容。');
      } else {
        // 否则返回公共路径
        logWithTimestamp('[image-proxy/GET] 返回公共路径。');
        return NextResponse.json({ imageUrl: publicPath });
      }
    } catch (cacheError) {
      // 缓存不存在，下载图片
      warnWithTimestamp(`[image-proxy/GET] 缓存未命中或读取失败: ${cacheError}. 开始下载图片: ${imageUrl}`);
      try {
        const response = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          timeout: 10000 // 10秒超时
        });
        
        imageBuffer = Buffer.from(response.data);
        extension = path.extname(cacheFileName);
        logWithTimestamp(`[image-proxy/GET] 图片下载成功，大小: ${imageBuffer.length} 字节`);
        
        // 保存到缓存
        try {
          await fs.writeFile(cachePath, imageBuffer);
          logWithTimestamp(`[image-proxy/GET] 图片成功保存到缓存: ${cachePath}`);
        } catch (writeError) {
          errorWithTimestamp(`[image-proxy/GET] 保存图片到缓存失败: ${writeError}`);
        }
        
        if (!direct) {
          // 返回缓存图片URL
          logWithTimestamp('[image-proxy/GET] 返回公共路径。');
          return NextResponse.json({ imageUrl: publicPath });
        }
      } catch (fetchError: unknown) {
        errorWithTimestamp('[image-proxy/GET] 下载图片失败:', fetchError);
        // 下载失败时返回默认图片
        const defaultImagePath = path.join(process.cwd(), 'public', 'placeholder-image.svg');
        warnWithTimestamp(`[image-proxy/GET] 下载失败，返回默认图片: ${defaultImagePath}`);
        try {
          imageBuffer = await fs.readFile(defaultImagePath);
          extension = '.svg';
        } catch (defaultImageError) {
          errorWithTimestamp('[image-proxy/GET] 读取默认图片失败:', defaultImageError);
          return new NextResponse('获取图片失败，且无法读取默认图片', { status: 500 });
        }
      }
    }
    
    // 如果是direct模式，直接返回图片内容
    if (direct) {
      logWithTimestamp(`[image-proxy/GET] direct模式: 返回图片内容，Content-Type: ${getContentType(extension)}`);
      const headers = new Headers({
        'Content-Type': getContentType(extension),
        'Content-Length': imageBuffer.length.toString(),
        'Cache-Control': 'public, max-age=86400' // 缓存1天
      });
      
      return new NextResponse(imageBuffer, { 
        status: 200,
        headers
      });
    } else {
      logWithTimestamp('[image-proxy/GET] 非direct模式: 返回公共路径。');
      return NextResponse.json({ imageUrl: publicPath });
    }
  } catch (error: unknown) {
    errorWithTimestamp('[image-proxy/GET] 图片代理请求发生未知错误:', error);
    return new NextResponse('获取图片失败', { status: 500 });
  }
} 