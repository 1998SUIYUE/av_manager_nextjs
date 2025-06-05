import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';

// 图片缓存目录
const CACHE_DIR = path.join(process.cwd(), 'public', 'image-cache');

// 支持的图片类型
const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

// 确保缓存目录存在
async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (error) {
    console.error('创建缓存目录失败:', error);
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
  try {
    await ensureCacheDir();
    
    // 获取URL参数
    const searchParams = request.nextUrl.searchParams;
    const imageUrl = searchParams.get('url');
    const direct = searchParams.get('direct') === 'true';
    
    if (!imageUrl) {
      return new NextResponse('缺少图片URL参数', { status: 400 });
    }
    
    // 缓存文件路径
    const cacheFileName = getCacheFileName(imageUrl);
    const cachePath = path.join(CACHE_DIR, cacheFileName);
    const publicPath = `/image-cache/${cacheFileName}`;
    
    let imageBuffer: Buffer;
    let extension: string;
    
    // 检查缓存是否存在
    try {
      await fs.access(cachePath);
      // 缓存存在
      extension = path.extname(cachePath);
      
      if (direct) {
        // 如果请求直接返回图片内容
        imageBuffer = await fs.readFile(cachePath);
      } else {
        // 否则返回公共路径
        return NextResponse.json({ imageUrl: publicPath });
      }
    } catch {
      // 缓存不存在，下载图片
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
        
        // 保存到缓存
        await fs.writeFile(cachePath, imageBuffer);
        
        if (!direct) {
          // 返回缓存图片URL
          return NextResponse.json({ imageUrl: publicPath });
        }
      } catch (fetchError) {
        console.error('下载图片失败:', fetchError);
        // 下载失败时返回默认图片
        const defaultImagePath = path.join(process.cwd(), 'public', 'placeholder-image.svg');
        imageBuffer = await fs.readFile(defaultImagePath);
        extension = '.svg';
      }
    }
    
    // 如果是direct模式，直接返回图片内容
    if (direct) {
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
      return NextResponse.json({ imageUrl: publicPath });
    }
  } catch (error) {
    console.error('图片代理错误:', error);
    return new NextResponse('获取图片失败', { status: 500 });
  }
} 