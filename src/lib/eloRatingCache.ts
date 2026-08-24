import { getDatabase } from "@/lib/appDatabase";

export interface EloRating {
  code: string;
  elo: number;
  matchCount: number;
  winCount: number;
  lossCount: number;
  drawCount: number;
  lastRated: number;
  /** 不确定度：初始 300，每打一场按比例缩小，最低 50 */
  sigma: number;
}

type EloRatingRow = {
  code: string;
  elo: number;
  match_count: number;
  win_count: number;
  loss_count: number;
  draw_count: number;
  last_rated: number;
  sigma: number;
};

export interface MatchLogEntry {
  id: number;
  codeA: string;
  codeB: string;
  result: "winA" | "winB" | "draw";
  eloBeforeA: number;
  eloAfterA: number;
  eloBeforeB: number;
  eloAfterB: number;
  createdAt: number;
}

export const INITIAL_SIGMA = 300;
export const MIN_SIGMA = 50;

/** 每场对战后 sigma 的收敛系数 */
export const SIGMA_DECAY = 0.95;

function normalizeCode(code: string): string {
  return String(code || "").trim().toUpperCase();
}

function toEloRating(row: EloRatingRow): EloRating {
  return {
    code: row.code,
    elo: row.elo,
    matchCount: row.match_count,
    winCount: row.win_count,
    lossCount: row.loss_count,
    drawCount: row.draw_count,
    lastRated: row.last_rated,
    sigma: row.sigma ?? INITIAL_SIGMA,
  };
}

export async function getAllEloRatings(): Promise<Map<string, EloRating>> {
  const rows = getDatabase()
    .prepare("SELECT * FROM elo_ratings ORDER BY elo DESC")
    .all() as EloRatingRow[];
  return new Map(rows.map((row) => [row.code, toEloRating(row)]));
}

export async function getEloRating(code: string): Promise<EloRating | null> {
  const row = getDatabase()
    .prepare("SELECT * FROM elo_ratings WHERE code = ?")
    .get(normalizeCode(code)) as EloRatingRow | undefined;
  return row ? toEloRating(row) : null;
}

/**
 * 在单个事务内原子更新两部影片的 Elo 评分，并写入对局日志。
 * 任一失败则整体回滚，保证 Elo 总分守恒且日志与评分一致。
 */
export async function updateEloPair(
  codeA: string,
  updatesA: Partial<EloRating>,
  codeB: string,
  updatesB: Partial<EloRating>,
  log?: { result: "winA" | "winB" | "draw"; eloBeforeA: number; eloBeforeB: number }
): Promise<void> {
  const db = getDatabase();
  const upsert = db.prepare(`
      INSERT INTO elo_ratings (
        code, elo, match_count, win_count, loss_count, draw_count, last_rated, sigma
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET
        elo = excluded.elo,
        match_count = excluded.match_count,
        win_count = excluded.win_count,
        loss_count = excluded.loss_count,
        draw_count = excluded.draw_count,
        last_rated = excluded.last_rated,
        sigma = excluded.sigma
    `);

  const insertLog = log
    ? db.prepare(`
        INSERT INTO match_log (
          code_a, code_b, result, elo_before_a, elo_after_a, elo_before_b, elo_after_b, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
    : null;

  const applyUpdate = (code: string, updates: Partial<EloRating>): number => {
    const normalizedCode = normalizeCode(code);
    const existingRow = db
      .prepare("SELECT * FROM elo_ratings WHERE code = ?")
      .get(normalizedCode) as EloRatingRow | undefined;

    const existing: EloRating = existingRow
      ? toEloRating(existingRow)
      : {
          code: normalizedCode,
          elo: 1000,
          matchCount: 0,
          winCount: 0,
          lossCount: 0,
          drawCount: 0,
          lastRated: 0,
          sigma: INITIAL_SIGMA,
        };

    const updated: EloRating = {
      ...existing,
      ...updates,
      code: normalizedCode,
      lastRated: Date.now(),
    };

    upsert.run(
      updated.code,
      updated.elo,
      updated.matchCount,
      updated.winCount,
      updated.lossCount,
      updated.drawCount,
      updated.lastRated,
      updated.sigma
    );

    return updated.elo;
  };

  db.exec("BEGIN");
  try {
    const eloAfterA = applyUpdate(codeA, updatesA);
    const eloAfterB = applyUpdate(codeB, updatesB);

    if (insertLog && log) {
      insertLog.run(
        normalizeCode(codeA),
        normalizeCode(codeB),
        log.result,
        log.eloBeforeA,
        eloAfterA,
        log.eloBeforeB,
        eloAfterB,
        Date.now()
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * 获取最近 N 条对局日志（按时间倒序）。
 */
export async function getRecentMatchLogs(limit: number = 20): Promise<MatchLogEntry[]> {
  const rows = getDatabase()
    .prepare("SELECT * FROM match_log ORDER BY created_at DESC LIMIT ?")
    .all(limit) as Array<{
    id: number;
    code_a: string;
    code_b: string;
    result: string;
    elo_before_a: number;
    elo_after_a: number;
    elo_before_b: number;
    elo_after_b: number;
    created_at: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    codeA: row.code_a,
    codeB: row.code_b,
    result: row.result as MatchLogEntry["result"],
    eloBeforeA: row.elo_before_a,
    eloAfterA: row.elo_after_a,
    eloBeforeB: row.elo_before_b,
    eloAfterB: row.elo_after_b,
    createdAt: row.created_at,
  }));
}
