import { NextResponse } from "next/server";
import { getAllEloRatings, updateEloRating, EloRating } from "@/lib/eloRatingCache";
import { devWithTimestamp } from "@/utils/logger";

function getKFactor(matchCount: number): number {
  if (matchCount < 5) return 48;
  if (matchCount < 20) return 32;
  if (matchCount < 50) return 24;
  return 16;
}

function calculateElo(
  eloA: number,
  eloB: number,
  matchCountA: number,
  matchCountB: number,
  result: "win" | "loss" | "draw"
): { newEloA: number; newEloB: number; changeA: number; changeB: number; kA: number; kB: number } {
  const expectedScoreA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  const expectedScoreB = 1 / (1 + Math.pow(10, (eloA - eloB) / 400));
  const kA = getKFactor(matchCountA);
  const kB = getKFactor(matchCountB);

  let scoreA: number;
  let scoreB: number;
  if (result === "win") {
    scoreA = 1;
    scoreB = 0;
  } else if (result === "loss") {
    scoreA = 0;
    scoreB = 1;
  } else {
    scoreA = 0.5;
    scoreB = 0.5;
  }

  const changeA = Math.round(kA * (scoreA - expectedScoreA));
  const changeB = Math.round(kB * (scoreB - expectedScoreB));

  return {
    newEloA: eloA + changeA,
    newEloB: eloB + changeB,
    changeA,
    changeB,
    kA,
    kB,
  };
}

function createInitialRating(code: string): EloRating {
  return {
    code,
    elo: 1000,
    matchCount: 0,
    winCount: 0,
    lossCount: 0,
    drawCount: 0,
    lastRated: 0,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const codeA = String(body.codeA || "").trim().toUpperCase();
    const codeB = String(body.codeB || "").trim().toUpperCase();
    const result = body.result as "winA" | "winB" | "draw";

    if (!codeA || !codeB || !result) {
      return NextResponse.json({ error: "缺少参数：codeA、codeB、result" }, { status: 400 });
    }

    if (codeA === codeB) {
      return NextResponse.json({ error: "同一番号不能参与对战评分" }, { status: 400 });
    }

    const currentEloRatings = await getAllEloRatings();
    const ratingA = currentEloRatings.get(codeA) || createInitialRating(codeA);
    const ratingB = currentEloRatings.get(codeB) || createInitialRating(codeB);

    let eloResult: "win" | "loss" | "draw";
    if (result === "winA") {
      eloResult = "win";
    } else if (result === "winB") {
      eloResult = "loss";
    } else if (result === "draw") {
      eloResult = "draw";
    } else {
      return NextResponse.json({ error: "无效的 result 参数" }, { status: 400 });
    }

    const { newEloA, newEloB, changeA, changeB, kA, kB } = calculateElo(
      ratingA.elo,
      ratingB.elo,
      ratingA.matchCount,
      ratingB.matchCount,
      eloResult
    );

    const updatedRatingA: Partial<EloRating> = {
      elo: newEloA,
      matchCount: ratingA.matchCount + 1,
      winCount: ratingA.winCount + (eloResult === "win" ? 1 : 0),
      lossCount: ratingA.lossCount + (eloResult === "loss" ? 1 : 0),
      drawCount: ratingA.drawCount + (eloResult === "draw" ? 1 : 0),
    };

    const updatedRatingB: Partial<EloRating> = {
      elo: newEloB,
      matchCount: ratingB.matchCount + 1,
      winCount: ratingB.winCount + (eloResult === "loss" ? 1 : 0),
      lossCount: ratingB.lossCount + (eloResult === "win" ? 1 : 0),
      drawCount: ratingB.drawCount + (eloResult === "draw" ? 1 : 0),
    };

    await updateEloRating(codeA, updatedRatingA);
    await updateEloRating(codeB, updatedRatingB);

    devWithTimestamp(
      `[EloAPI] ${codeA}: ${ratingA.elo} -> ${newEloA} (${changeA}, K=${kA}); ${codeB}: ${ratingB.elo} -> ${newEloB} (${changeB}, K=${kB})`
    );

    return NextResponse.json(
      {
        message: "Elo ratings updated successfully",
        updatedRatingA: { ...ratingA, ...updatedRatingA, code: codeA },
        updatedRatingB: { ...ratingB, ...updatedRatingB, code: codeB },
        changes: { changeA, changeB, kA, kB },
      },
      { status: 200 }
    );
  } catch (error) {
    devWithTimestamp("[EloAPI] Error updating Elo ratings:", error);
    return NextResponse.json({ error: "更新 Elo 评分失败" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code")?.trim().toUpperCase();
    const ratings = await getAllEloRatings();

    if (code) {
      return NextResponse.json(ratings.get(code) || null);
    }

    return NextResponse.json(Array.from(ratings.values()));
  } catch (error) {
    devWithTimestamp("[EloAPI] Error fetching Elo ratings:", error);
    return NextResponse.json({ error: "读取 Elo 评分失败" }, { status: 500 });
  }
}
