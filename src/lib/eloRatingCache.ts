import { getDatabase } from "@/lib/appDatabase";

export interface EloRating {
  code: string;
  elo: number;
  matchCount: number;
  winCount: number;
  lossCount: number;
  drawCount: number;
  lastRated: number;
}

type EloRatingRow = {
  code: string;
  elo: number;
  match_count: number;
  win_count: number;
  loss_count: number;
  draw_count: number;
  last_rated: number;
};

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

export async function updateEloRating(code: string, updates: Partial<EloRating>) {
  const normalizedCode = normalizeCode(code);
  const existing = (await getEloRating(normalizedCode)) || {
    code: normalizedCode,
    elo: 1000,
    matchCount: 0,
    winCount: 0,
    lossCount: 0,
    drawCount: 0,
    lastRated: 0,
  };

  const updatedEntry: EloRating = {
    ...existing,
    ...updates,
    code: normalizedCode,
    lastRated: Date.now(),
  };

  getDatabase()
    .prepare(`
      INSERT INTO elo_ratings (
        code, elo, match_count, win_count, loss_count, draw_count, last_rated
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET
        elo = excluded.elo,
        match_count = excluded.match_count,
        win_count = excluded.win_count,
        loss_count = excluded.loss_count,
        draw_count = excluded.draw_count,
        last_rated = excluded.last_rated
    `)
    .run(
      updatedEntry.code,
      updatedEntry.elo,
      updatedEntry.matchCount,
      updatedEntry.winCount,
      updatedEntry.lossCount,
      updatedEntry.drawCount,
      updatedEntry.lastRated
    );
}
