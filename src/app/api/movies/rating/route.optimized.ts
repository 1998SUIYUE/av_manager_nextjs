import { NextResponse } from "next/server";
import { getCachedMovieMetadata, updateMovieMetadataCache } from "@/lib/movieMetadataCache";
import { devWithTimestamp } from "@/utils/logger";

// 对比结果类型
type ComparisonResult = 'A_WINS' | 'B_WINS' | 'DRAW';

// Elo评分数据接口
interface EloRatingData {
  elo: number;
  matchCount: number;
  winCount: number;
  drawCount: number;
  lossCount: number;
  lastRated: number;
  recentMatches: string[];
}

/**
 * 计算改进的Elo评分变化
 * @param eloA 影片A的Elo评分
 * @param eloB 影片B的Elo评分
 * @param result 对比结果
 * @param matchCountA 影片A的对比次数
 * @param matchCountB 影片B的对比次数
 * @returns 两部影片的Elo变化值
 */
function calculateEloChange(
  eloA: number,
  eloB: number,
  result: ComparisonResult,
  matchCountA: number,
  matchCountB: number
): { changeA: number, changeB: number } {
  
  // 动态K因子：新影片变化大，老影片变化小
  const getKFactor = (matchCount: number): number => {
    if (matchCount < 10) return 40;      // 新影片
    if (matchCount < 30) return 32;      // 中等经验
    return 24;                           // 老影片
  };
  
  const kA = getKFactor(matchCountA);
  const kB = getKFactor(matchCountB);
  
  const expectedA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  const expectedB = 1 - expectedA;
  
  let actualA: number, actualB: number;
  switch (result) {
    case 'A_WINS': 
      actualA = 1; 
      actualB = 0; 
      break;
    case 'B_WINS': 
      actualA = 0; 
      actualB = 1; 
      break;
    case 'DRAW': 
      actualA = 0.5; 
      actualB = 0.5; 
      break;
  }
  
  return {
    changeA: Math.round(kA * (actualA - expectedA)),
    changeB: Math.round(kB * (actualB - expectedB))
  };
}

/**
 * 获取影片的Elo评分数据，如果不存在则返回默认值
 * @param code 影片番号
 * @param baseUrl 基础URL
 * @returns Elo评分数据
 */
async function getEloRatingData(code: string, baseUrl: string): Promise<EloRatingData> {
  const metadata = await getCachedMovieMetadata(code, baseUrl);
  
  return {
    elo: metadata?.elo || 1000,
    matchCount: metadata?.matchCount || 0,
    winCount: metadata?.winCount || 0,
    drawCount: metadata?.drawCount || 0,
    lossCount: metadata?.lossCount || 0,
    lastRated: metadata?.lastRated || 0,
    recentMatches: metadata?.recentMatches || []
  };
}

/**
 * 异步更新评分数据（不阻塞API响应）
 */
async function updateRatingsAsync(
  movieACode: string, 
  movieBCode: string, 
  result: ComparisonResult,
  ratingA: EloRatingData,
  ratingB: EloRatingData,
  changeA: number,
  changeB: number
): Promise<void> {
  try {
    // 更新影片A的数据
    const newRatingA: EloRatingData = {
      elo: ratingA.elo + changeA,
      matchCount: ratingA.matchCount + 1,
      winCount: ratingA.winCount + (result === 'A_WINS' ? 1 : 0),
      drawCount: ratingA.drawCount + (result === 'DRAW' ? 1 : 0),
      lossCount: ratingA.lossCount + (result === 'B_WINS' ? 1 : 0),
      lastRated: Date.now(),
      recentMatches: [...ratingA.recentMatches.slice(-9), movieBCode] // 保留最近10次对比
    };
    
    // 更新影片B的数据
    const newRatingB: EloRatingData = {
      elo: ratingB.elo + changeB,
      matchCount: ratingB.matchCount + 1,
      winCount: ratingB.winCount + (result === 'B_WINS' ? 1 : 0),
      drawCount: ratingB.drawCount + (result === 'DRAW' ? 1 : 0),
      lossCount: ratingB.lossCount + (result === 'A_WINS' ? 1 : 0),
      lastRated: Date.now(),
      recentMatches: [...ratingB.recentMatches.slice(-9), movieACode] // 保留最近10次对比
    };
    
    // 使用批量写入队列更新数据（不等待完成）
    await Promise.all([
      updateMovieMetadataCache(
        movieACode,
        null, // 不修改coverUrl
        null, // 不修改title
        null, // 不修改actress
        {
          elo: newRatingA.elo,
          matchCount: newRatingA.matchCount,
          winCount: newRatingA.winCount,
          drawCount: newRatingA.drawCount,
          lossCount: newRatingA.lossCount,
          lastRated: newRatingA.lastRated,
          recentMatches: newRatingA.recentMatches
        }
      ),
      updateMovieMetadataCache(
        movieBCode,
        null, // 不修改coverUrl
        null, // 不修改title
        null, // 不修改actress
        {
          elo: newRatingB.elo,
          matchCount: newRatingB.matchCount,
          winCount: newRatingB.winCount,
          drawCount: newRatingB.drawCount,
          lossCount: newRatingB.lossCount,
          lastRated: newRatingB.lastRated,
          recentMatches: newRatingB.recentMatches
        }
      )
    ]);
    
    devWithTimestamp(`[updateRatingsAsync] 评分更新完成 - ${movieACode}: ${ratingA.elo} → ${newRatingA.elo} (${changeA > 0 ? '+' : ''}${changeA})`);
    devWithTimestamp(`[updateRatingsAsync] 评分更新完成 - ${movieBCode}: ${ratingB.elo} → ${newRatingB.elo} (${changeB > 0 ? '+' : ''}${changeB})`);
  } catch (error) {
    devWithTimestamp("[updateRatingsAsync] 异步更新评分数据失败:", error);
  }
}

/**
 * POST 请求处理函数，用于处理影片对比评分
 * 优化版本：先返回响应，然后异步更新评分数据
 */
export async function POST(request: Request) {
  const startTime = Date.now();
  devWithTimestamp(`[POST /api/movies/rating] 接收到评分请求`);
  
  try {
    const { movieACode, movieBCode, result } = await request.json();
    const baseUrl = new URL(request.url).origin;
    
    if (!movieACode || !movieBCode || !result) {
      return NextResponse.json(
        { error: "缺少必要参数" },
        { status: 400 }
      );
    }
    
    devWithTimestamp(`[POST /api/movies/rating] 对比: ${movieACode} vs ${movieBCode}, 结果: ${result}`);
    
    // 获取两部影片的当前Elo数据
    const [ratingA, ratingB] = await Promise.all([
      getEloRatingData(movieACode, baseUrl),
      getEloRatingData(movieBCode, baseUrl)
    ]);
    
    // 计算Elo变化
    const { changeA, changeB } = calculateEloChange(
      ratingA.elo,
      ratingB.elo,
      result as ComparisonResult,
      ratingA.matchCount,
      ratingB.matchCount
    );
    
    // 计算新的评分（用于返回给客户端）
    const newEloA = ratingA.elo + changeA;
    const newEloB = ratingB.elo + changeB;
    
    // 异步更新评分数据（不阻塞API响应）
    updateRatingsAsync(
      movieACode,
      movieBCode,
      result as ComparisonResult,
      ratingA,
      ratingB,
      changeA,
      changeB
    ).catch(error => {
      devWithTimestamp("[POST /api/movies/rating] 异步更新评分数据失败:", error);
    });
    
    const processingTime = Date.now() - startTime;
    devWithTimestamp(`[POST /api/movies/rating] 请求处理完成，耗时: ${processingTime}ms`);
    
    // 立即返回响应，不等待评分数据更新完成
    return NextResponse.json({
      success: true,
      processingTime,
      movieA: {
        code: movieACode,
        oldElo: ratingA.elo,
        newElo: newEloA,
        change: changeA
      },
      movieB: {
        code: movieBCode,
        oldElo: ratingB.elo,
        newElo: newEloB,
        change: changeB
      }
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    devWithTimestamp(`[POST /api/movies/rating] 处理评分请求时发生错误 (${processingTime}ms):`, error);
    return NextResponse.json(
      { error: "评分处理失败" },
      { status: 500 }
    );
  }
}