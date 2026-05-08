import { NextRequest, NextResponse } from 'next/server';
import { getCachedMovieMetadata } from '@/lib/movieMetadataCache';
import { fetchCoverUrl } from '@/lib/movie-fetchers';
import { devWithTimestamp } from '@/utils/logger';

type MovieDetailsResult = Awaited<ReturnType<typeof fetchCoverUrl>>;

const inFlightDetailRequests = new Map<string, Promise<MovieDetailsResult>>();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code: rawCode } = await params; // Await the params promise as per user's finding
    const code = rawCode?.trim().toUpperCase();
    const baseUrl = new URL(request.url).origin;
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
    
    devWithTimestamp(`[movie-details] 接收到 GET 请求 for code: ${code}`);

    if (!code) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }

    const cachedMetadata = await getCachedMovieMetadata(code);
    if (
      !forceRefresh &&
      cachedMetadata &&
      (cachedMetadata.title || cachedMetadata.coverUrl || cachedMetadata.actress)
    ) {
        devWithTimestamp(`[movie-details] 缓存命中: ${code}`);
        return NextResponse.json(cachedMetadata);
    }

    devWithTimestamp(`[movie-details] 缓存未命中，开始抓取: ${code}`);
    const existingRequest = inFlightDetailRequests.get(code);
    if (!forceRefresh && existingRequest) {
      devWithTimestamp(`[movie-details] 复用正在抓取的请求: ${code}`);
      const movieDetails = await existingRequest;
      if (!movieDetails || (!movieDetails.title && !movieDetails.coverUrl)) {
        return NextResponse.json({ error: "Failed to fetch movie details for code: " + code }, { status: 404 });
      }
      return NextResponse.json(movieDetails);
    }

    const detailPromise = fetchCoverUrl(code, baseUrl).finally(() => {
      inFlightDetailRequests.delete(code);
    });
    inFlightDetailRequests.set(code, detailPromise);

    const movieDetails = await detailPromise;

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
