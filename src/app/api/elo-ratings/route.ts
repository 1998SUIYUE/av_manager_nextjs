import { NextResponse } from "next/server";
import {
  getAllEloRatings,
  getRecentMatchLogs,
  updateEloPair,
  INITIAL_SIGMA,
  MatchLogEntry,
  EloRating,
} from "@/lib/eloRatingCache";
import { getDatabase } from "@/lib/appDatabase";
import { calculateElo, decaySigma } from "@/lib/eloCalc";
import { devWithTimestamp } from "@/utils/logger";

function createInitialRating(code: string, elo: number = 1000): EloRating {
  return {
    code,
    elo,
    matchCount: 0,
    winCount: 0,
    lossCount: 0,
    drawCount: 0,
    lastRated: 0,
    sigma: INITIAL_SIGMA,
  };
}

/**
 * 获取新影片的入场评分：当前全库 Elo 中位数。
 */
function getMedianElo(ratings: Map<string, EloRating>): number {
  const elos = Array.from(ratings.values()).map((r) => r.elo).sort((a, b) => a - b);
  if (elos.length === 0) return 1000;
  const mid = Math.floor(elos.length / 2);
  return elos.length % 2 === 0 ? Math.round((elos[mid - 1] + elos[mid]) / 2) : elos[mid];
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
    const medianElo = getMedianElo(currentEloRatings);
    const ratingA = currentEloRatings.get(codeA) || createInitialRating(codeA, medianElo);
    const ratingB = currentEloRatings.get(codeB) || createInitialRating(codeB, medianElo);

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

    // 时间修正：距上次评分越久，K 越大
    const { newEloA, newEloB, changeA, changeB, kA, kB } = calculateElo(
      ratingA.elo,
      ratingB.elo,
      ratingA.matchCount,
      ratingB.matchCount,
      eloResult,
      ratingA.lastRated,
      ratingB.lastRated
    );

    const updatedRatingA: Partial<EloRating> = {
      elo: newEloA,
      matchCount: ratingA.matchCount + 1,
      winCount: ratingA.winCount + (eloResult === "win" ? 1 : 0),
      lossCount: ratingA.lossCount + (eloResult === "loss" ? 1 : 0),
      drawCount: ratingA.drawCount + (eloResult === "draw" ? 1 : 0),
      sigma: decaySigma(ratingA.sigma),
    };

    const updatedRatingB: Partial<EloRating> = {
      elo: newEloB,
      matchCount: ratingB.matchCount + 1,
      winCount: ratingB.winCount + (eloResult === "loss" ? 1 : 0),
      lossCount: ratingB.lossCount + (eloResult === "win" ? 1 : 0),
      drawCount: ratingB.drawCount + (eloResult === "draw" ? 1 : 0),
      sigma: decaySigma(ratingB.sigma),
    };

    // 原子更新：两行评分和对局日志要么同时成功，要么同时回滚
    await updateEloPair(codeA, updatedRatingA, codeB, updatedRatingB, {
      result,
      eloBeforeA: ratingA.elo,
      eloBeforeB: ratingB.elo,
    });

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

/**
 * 撤销最近一场对局。
 */
export async function DELETE() {
  try {
    const db = getDatabase();
    const lastLogRow = db
      .prepare("SELECT * FROM match_log ORDER BY created_at DESC LIMIT 1")
      .get() as
      | {
          id: number;
          code_a: string;
          code_b: string;
          result: string;
          elo_before_a: number;
          elo_after_a: number;
          elo_before_b: number;
          elo_after_b: number;
          created_at: number;
        }
      | undefined;

    if (!lastLogRow) {
      return NextResponse.json({ error: "没有可撤销的对局" }, { status: 404 });
    }

    const ratings = await getAllEloRatings();
    const ratingA = ratings.get(lastLogRow.code_a);
    const ratingB = ratings.get(lastLogRow.code_b);

    if (!ratingA || !ratingB) {
      return NextResponse.json({ error: "找不到对应的评分记录，无法撤销" }, { status: 500 });
    }

    const revertedA = revertRating(ratingA, lastLogRow.result as "winA" | "winB" | "draw", "A");
    const revertedB = revertRating(ratingB, lastLogRow.result as "winA" | "winB" | "draw", "B");
    revertedA.elo = lastLogRow.elo_before_a;
    revertedB.elo = lastLogRow.elo_before_b;

    await updateEloPair(lastLogRow.code_a, revertedA, lastLogRow.code_b, revertedB);

    db.prepare("DELETE FROM match_log WHERE id = ?").run(lastLogRow.id);

    devWithTimestamp(`[EloAPI] Reverted match: ${lastLogRow.code_a} vs ${lastLogRow.code_b}`);

    return NextResponse.json({
      message: "对局已撤销",
      reverted: {
        codeA: lastLogRow.code_a,
        codeB: lastLogRow.code_b,
        result: lastLogRow.result,
      },
    });
  } catch (error) {
    devWithTimestamp("[EloAPI] Error reverting match:", error);
    return NextResponse.json({ error: "撤销失败" }, { status: 500 });
  }
}

/**
 * 获取最近对局日志。
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const limit = Number(body.limit) > 0 ? Number(body.limit) : 20;
    const logs: MatchLogEntry[] = await getRecentMatchLogs(limit);
    return NextResponse.json({ logs });
  } catch (error) {
    devWithTimestamp("[EloAPI] Error fetching logs:", error);
    return NextResponse.json({ error: "读取日志失败" }, { status: 500 });
  }
}

// 辅助函数

function revertRating(
  rating: EloRating,
  result: "winA" | "winB" | "draw",
  side: "A" | "B"
): Partial<EloRating> {
  let winDelta = 0;
  let lossDelta = 0;
  let drawDelta = 0;

  if (side === "A") {
    if (result === "winA") winDelta = -1;
    else if (result === "winB") lossDelta = -1;
    else drawDelta = -1;
  } else {
    if (result === "winB") winDelta = -1;
    else if (result === "winA") lossDelta = -1;
    else drawDelta = -1;
  }

  return {
    matchCount: rating.matchCount - 1,
    winCount: Math.max(0, rating.winCount + winDelta),
    lossCount: Math.max(0, rating.lossCount + lossDelta),
    drawCount: Math.max(0, rating.drawCount + drawDelta),
  };
}
