import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { devWithTimestamp } from '@/utils/logger';
import { getImageCachePath } from '@/utils/paths';

// 图片缓存目录
const CACHE_DIR = getImageCachePath();

// 支持的图片类型
const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

// 确保缓存目录存在
async function ensureCacheDir() {
  devWithTimestamp('[ensureCacheDir] 检查或创建图片缓存目录...');
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    devWithTimestamp(`[ensureCacheDir] 缓存目录 '${CACHE_DIR}' 已存在或创建成功。`);
  } catch (error: unknown) {
    devWithTimestamp('[ensureCacheDir] 创建缓存目录失败:', error);
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
  devWithTimestamp('[image-proxy/GET] 收到图片代理请求');
  try {
    await ensureCacheDir();
    
    // 获取URL参数
    const searchParams = request.nextUrl.searchParams;
    const imageUrl = searchParams.get('url');
    
    if (!imageUrl) {
      devWithTimestamp('[image-proxy/GET] 缺少图片URL参数，返回 400');
      return new NextResponse('缺少图片URL参数', { status: 400 });
    }
    devWithTimestamp(`[image-proxy/GET] 请求的图片URL: ${imageUrl}`);
    
    // 缓存文件路径
    const cacheFileName = getCacheFileName(imageUrl);
    const cachePath = path.join(CACHE_DIR, cacheFileName);
    const apiPath = `/api/image-serve/${cacheFileName}`;
    devWithTimestamp(`[image-proxy/GET] 缓存文件路径: ${cachePath}, API路径: ${apiPath}`);
    
    // 检查缓存是否存在
    try {
      devWithTimestamp(`[image-proxy/GET] 尝试从缓存读取: ${cachePath}`);
      await fs.access(cachePath);
      // 缓存存在，返回API路径
      devWithTimestamp(`[image-proxy/GET] 缓存命中，返回API路径: ${apiPath}`);
      return NextResponse.json({ imageUrl: apiPath });
    } catch (cacheError) {
      // 缓存不存在，下载图片
      devWithTimestamp(`[image-proxy/GET] 缓存未命中或读取失败: ${cacheError}. 开始下载图片: ${imageUrl}`);
      try {
        const response = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          timeout: 10000 // 10秒超时
        });
        
        const imageBuffer = Buffer.from(response.data);
        devWithTimestamp(`[image-proxy/GET] 图片下载成功，大小: ${imageBuffer.length} 字节`);
        
        // 保存到缓存
        try {
          await fs.writeFile(cachePath, imageBuffer);
          devWithTimestamp(`[image-proxy/GET] 图片成功保存到缓存: ${cachePath}`);
        } catch (writeError) {
          devWithTimestamp(`[image-proxy/GET] 保存图片到缓存失败: ${writeError}`);
        }
        
        // 返回缓存图片URL
        devWithTimestamp(`[image-proxy/GET] 返回API路径: ${apiPath}`);
        return NextResponse.json({ imageUrl: apiPath });
      } catch (fetchError: unknown) {
        devWithTimestamp('[image-proxy/GET] 下载图片失败:', fetchError);
        // 下载失败时返回占位符图片路径
        devWithTimestamp(`[image-proxy/GET] 下载失败，返回占位符图片路径`);
        return NextResponse.json({ imageUrl: '/placeholder-image.svg' });
      }
    }
  } catch (error: unknown) {
    devWithTimestamp('[image-proxy/GET] 图片代理请求发生未知错误:', error);
    return new NextResponse('获取图片失败', { status: 500 });
  }
} 