import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { devWithTimestamp } from '@/utils/logger';
import { getImageCachePath } from '@/utils/paths';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// 生成缓存文件名（基于视频绝对路径 + 可选时间点）
function getThumbCacheName(videoPath: string, timestampSec: number) {
  const hash = crypto.createHash('md5').update(`${videoPath}|${timestampSec}`).digest('hex');
  return `${hash}.jpg`;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const b64Path = searchParams.get('path'); // base64 编码的视频绝对路径
    const tsParam = searchParams.get('t'); // 可选：抽帧时间（秒）

    if (!b64Path) {
      return NextResponse.json({ error: '缺少 path 参数' }, { status: 400 });
    }

    // 解码视频绝对路径
    let videoPath: string;
    try {
      videoPath = decodeURIComponent(Buffer.from(b64Path, 'base64').toString('utf-8'));
    } catch {
      return NextResponse.json({ error: 'path 参数解码失败' }, { status: 400 });
    }

    // 合法性/存在性检查
    try {
      await fs.access(videoPath);
    } catch {
      return NextResponse.json({ error: '视频文件不存在或无法访问' }, { status: 404 });
    }

    // 时间点（秒），默认取 10s
    const timestampSec = Math.max(0, Number.isFinite(Number(tsParam)) ? Number(tsParam) : 5);

    const CACHE_DIR = getImageCachePath();
    const cacheName = getThumbCacheName(videoPath, timestampSec);
    const cachePath = path.join(CACHE_DIR, cacheName);
    const apiPath = `/api/image-serve/${cacheName}`;

    // 若缩略图已存在，直接返回
    try {
      await fs.access(cachePath);
      return NextResponse.json({ imageUrl: apiPath });
    } catch {}

    // 确保缓存目录存在
    await fs.mkdir(CACHE_DIR, { recursive: true });

    // 使用 ffmpeg 生成缩略图
    // -ss 放在 -i 前以更快定位；-frames:v 1 取一帧；-vf 缩放到宽 640 保持比例
    const ffmpegArgs = [
      '-ss', String(timestampSec),
      '-i', videoPath,
      '-frames:v', '1',
      '-vf', 'thumbnail,scale=640:-1',
      '-y', cachePath,
    ];

    try {
      devWithTimestamp(`[thumbnail] 调用 ffmpeg 生成缩略图: ${videoPath} -> ${cachePath}`);
      await execFileAsync('ffmpeg', ffmpegArgs, { windowsHide: true });
      // 生成成功
      return NextResponse.json({ imageUrl: apiPath });
    } catch (err) {
      devWithTimestamp('[thumbnail] 生成缩略图失败:', err);
      return NextResponse.json({ imageUrl: null, error: '生成缩略图失败' });
    }
  } catch (error) {
    devWithTimestamp('[thumbnail] 未知错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
