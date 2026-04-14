// src/app/api/elo-ratings/route.ts
import { NextResponse } from "next/server";
import { getAllEloRatings, updateEloRating, EloRating } from "@/lib/eloRatingCache";
import { devWithTimestamp } from "@/utils/logger";

// Elo 计算函数 (从 MovieDuel.tsx 迁移过来，现在在服务器端执行)
function calculateElo(eloA: number, eloB: number, result: 'win' | 'loss' | 'draw'): { newEloA: number, newEloB: number } {
    const K = 32; // K-factor
    const expectedScoreA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
    const expectedScoreB = 1 / (1 + Math.pow(10, (eloA - eloB) / 400));

    let scoreA: number, scoreB: number;
    if (result === 'win') {
        scoreA = 1;
        scoreB = 0;
    } else if (result === 'loss') {
        scoreA = 0;
        scoreB = 1;
    } else { // draw
        scoreA = 0.5;
        scoreB = 0.5;
    }

    const newEloA = Math.round(eloA + K * (scoreA - expectedScoreA));
    const newEloB = Math.round(eloB + K * (scoreB - expectedScoreB));

    return { newEloA, newEloB };
}

export async function POST(request: Request) {
  try {
    const { codeA, codeB, result } = await request.json(); // result: 'winA', 'winB', 'draw'

    if (!codeA || !codeB || !result) {
      return NextResponse.json({ error: "Missing parameters: codeA, codeB, result" }, { status: 400 });
    }

    // 获取所有 Elo 评分
    const currentEloRatings = await getAllEloRatings();

    // 获取或初始化两部电影的 Elo 评分
    const ratingA = currentEloRatings.get(codeA) || { code: codeA, elo: 1000, matchCount: 0, winCount: 0, lossCount: 0, drawCount: 0, lastRated: 0 };
    const ratingB = currentEloRatings.get(codeB) || { code: codeB, elo: 1000, matchCount: 0, winCount: 0, lossCount: 0, drawCount: 0, lastRated: 0 };

    let eloResult: 'win' | 'loss' | 'draw';
    if (result === 'winA') {
      eloResult = 'win';
    } else if (result === 'winB') {
      eloResult = 'loss'; // 对于 A 来说是输
    } else if (result === 'draw') {
      eloResult = 'draw';
    } else {
      return NextResponse.json({ error: "Invalid result value" }, { status: 400 });
    }

    const { newEloA, newEloB } = calculateElo(ratingA.elo, ratingB.elo, eloResult);

    // 更新 A 电影的统计数据
    const updatedRatingA: Partial<EloRating> = {
      elo: newEloA,
      matchCount: ratingA.matchCount + 1,
      winCount: ratingA.winCount + (eloResult === 'win' ? 1 : 0),
      lossCount: ratingA.lossCount + (eloResult === 'loss' ? 1 : 0),
      drawCount: ratingA.drawCount + (eloResult === 'draw' ? 1 : 0),
    };
    await updateEloRating(codeA, updatedRatingA);

    // 更新 B 电影的统计数据 (结果与 A 相反)
    const updatedRatingB: Partial<EloRating> = {
      elo: newEloB,
      matchCount: ratingB.matchCount + 1,
      winCount: ratingB.winCount + (eloResult === 'loss' ? 1 : 0), // B 赢相当于 A 输
      lossCount: ratingB.lossCount + (eloResult === 'win' ? 1 : 0), // B 输相当于 A 赢
      drawCount: ratingB.drawCount + (eloResult === 'draw' ? 1 : 0),
    };
    await updateEloRating(codeB, updatedRatingB);

    devWithTimestamp(`[EloAPI] Updated Elo for ${codeA}: ${ratingA.elo} -> ${newEloA}`);
    devWithTimestamp(`[EloAPI] Updated Elo for ${codeB}: ${ratingB.elo} -> ${newEloB}`);

    // 返回更新后的完整 EloRating 对象，以便客户端直接更新本地状态
    return NextResponse.json({
      message: "Elo ratings updated successfully",
      updatedRatingA: { ...ratingA, ...updatedRatingA, code: codeA },
      updatedRatingB: { ...ratingB, ...updatedRatingB, code: codeB },
    }, { status: 200 });

  } catch (error) {
    devWithTimestamp("[EloAPI] Error updating Elo ratings:", error);
    return NextResponse.json({ error: "Failed to update Elo ratings" }, { status: 500 });
  }
}

// 也可以添加一个 GET 请求来获取所有或单个 Elo 评分，供将来可能使用
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (code) {
      const rating = await getAllEloRatings();
      return NextResponse.json(rating.get(code));
    } else {
      const allRatings = await getAllEloRatings();
      const ratingsArray = Array.from(allRatings.values());
      return NextResponse.json(ratingsArray);
    }
  } catch (error) {
    devWithTimestamp("[EloAPI] Error fetching Elo ratings:", error);
    return NextResponse.json({ error: "Failed to fetch Elo ratings" }, { status: 500 });
  }
}
