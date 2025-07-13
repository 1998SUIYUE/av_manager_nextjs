import { NextRequest, NextResponse } from 'next/server';

// 重定向旧的图片缓存路径到新的 API 路径
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    // devWithTimestamp(`[image-cache-redirect] 重定向旧路径: /image-cache/${filename} -> /api/image-serve/${filename}`);
    
    // 重定向到新的 API 路径
    const newUrl = `/api/image-serve/${filename}`;
    return NextResponse.redirect(new URL(newUrl, request.url));
  } catch {
    // devWithTimestamp(`[image-cache-redirect] 重定向失败:`, error);
    return new NextResponse('重定向失败', { status: 500 });
  }
}