import { NextRequest, NextResponse } from 'next/server';
import { getCachedMovieMetadata } from '@/lib/movieMetadataCache';
import { fetchCoverUrl } from '@/lib/movie-fetchers';
import { devWithTimestamp } from '@/utils/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params; // Await the params promise as per user's finding
    const baseUrl = new URL(request.url).origin;
    
    devWithTimestamp(`[movie-details] 接收到 GET 请求 for code: ${code}`);

    if (!code) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }

    const cachedMetadata = await getCachedMovieMetadata(code);
    if (cachedMetadata && cachedMetadata.title) {
        devWithTimestamp(`[movie-details] 缓存命中: ${code}`);
        return NextResponse.json(cachedMetadata);
    }

    devWithTimestamp(`[movie-details] 缓存未命中，开始抓取: ${code}`);
    const movieDetails = await fetchCoverUrl(code, baseUrl);

    if (!movieDetails || (!movieDetails.title && !movieDetails.coverUrl)) {
        return NextResponse.json({ error: "Failed to fetch movie details for code: " + code }, { status: 404 });
    }

    return NextResponse.json(movieDetails);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    devWithTimestamp(`[movie-details] 获取电影详情时发生错误:`, errorMessage);
    return NextResponse.json({ error: "无法获取电影详情", details: errorMessage }, { status: 500 });
  }
}