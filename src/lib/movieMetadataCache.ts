import { getDatabase, parseJsonArray } from "@/lib/appDatabase";
import { devWithTimestamp } from "@/utils/logger";

export interface MovieMetadata {
  code: string;
  coverUrl: string | null;
  title: string | null;
  actress: string | null;
  lastUpdated: number;
  kinds?: string[];
  elo?: number;
  matchCount?: number;
  winCount?: number;
  drawCount?: number;
  lossCount?: number;
  lastRated?: number;
  recentMatches?: string[];
}

type MetadataRow = {
  code: string;
  cover_url: string | null;
  title: string | null;
  actress: string | null;
  last_updated: number;
  kinds: string | null;
  elo: number | null;
  match_count: number | null;
  win_count: number | null;
  draw_count: number | null;
  loss_count: number | null;
  last_rated: number | null;
  recent_matches: string | null;
};

function toMetadata(row: MetadataRow): MovieMetadata {
  return {
    code: row.code,
    coverUrl: row.cover_url,
    title: row.title,
    actress: row.actress,
    lastUpdated: row.last_updated,
    kinds: parseJsonArray(row.kinds),
    elo: row.elo ?? undefined,
    matchCount: row.match_count ?? undefined,
    winCount: row.win_count ?? undefined,
    drawCount: row.draw_count ?? undefined,
    lossCount: row.loss_count ?? undefined,
    lastRated: row.last_rated ?? undefined,
    recentMatches: parseJsonArray(row.recent_matches),
  };
}

function normalizeCode(code: string): string {
  return String(code || "").trim().toUpperCase();
}

export async function getAllCachedMovieMetadata(): Promise<Map<string, MovieMetadata>> {
  const rows = getDatabase()
    .prepare("SELECT * FROM movie_metadata ORDER BY last_updated DESC")
    .all() as MetadataRow[];
  return new Map(rows.map((row) => [row.code, toMetadata(row)]));
}

export async function getCachedMovieMetadata(code: string): Promise<MovieMetadata | null> {
  const row = getDatabase()
    .prepare("SELECT * FROM movie_metadata WHERE code = ?")
    .get(normalizeCode(code)) as MetadataRow | undefined;
  return row ? toMetadata(row) : null;
}

export async function deleteMovieMetadata(code: string): Promise<boolean> {
  const result = getDatabase()
    .prepare("DELETE FROM movie_metadata WHERE code = ?")
    .run(normalizeCode(code));
  const deleted = result.changes > 0;
  if (deleted) {
    devWithTimestamp(`[MovieMetadataDB] Deleted metadata for code: ${code}`);
  }
  return deleted;
}

export async function updateMovieMetadataCache(
  code: string,
  coverUrl: string | null,
  title: string | null,
  actress: string | null,
  kinds?: string[] | null,
  eloData?: Partial<MovieMetadata>
) {
  const normalizedCode = normalizeCode(code);
  const existing = await getCachedMovieMetadata(normalizedCode);
  const updatedEntry: MovieMetadata = {
    code: normalizedCode,
    lastUpdated: Date.now(),
    coverUrl: coverUrl !== undefined ? coverUrl : existing?.coverUrl || null,
    title: title !== undefined ? title : existing?.title || null,
    actress: actress !== undefined ? actress : existing?.actress || null,
    kinds: kinds != null ? kinds : existing?.kinds,
    elo: eloData?.elo !== undefined ? eloData.elo : existing?.elo ?? 1000,
    matchCount: eloData?.matchCount !== undefined ? eloData.matchCount : existing?.matchCount ?? 0,
    winCount: eloData?.winCount !== undefined ? eloData.winCount : existing?.winCount ?? 0,
    drawCount: eloData?.drawCount !== undefined ? eloData.drawCount : existing?.drawCount ?? 0,
    lossCount: eloData?.lossCount !== undefined ? eloData.lossCount : existing?.lossCount ?? 0,
    lastRated: eloData?.lastRated !== undefined ? eloData.lastRated : existing?.lastRated,
    recentMatches: eloData?.recentMatches !== undefined ? eloData.recentMatches : existing?.recentMatches || [],
  };

  getDatabase()
    .prepare(`
      INSERT INTO movie_metadata (
        code, cover_url, title, actress, last_updated, kinds, elo, match_count,
        win_count, draw_count, loss_count, last_rated, recent_matches
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET
        cover_url = excluded.cover_url,
        title = excluded.title,
        actress = excluded.actress,
        last_updated = excluded.last_updated,
        kinds = excluded.kinds,
        elo = excluded.elo,
        match_count = excluded.match_count,
        win_count = excluded.win_count,
        draw_count = excluded.draw_count,
        loss_count = excluded.loss_count,
        last_rated = excluded.last_rated,
        recent_matches = excluded.recent_matches
    `)
    .run(
      updatedEntry.code,
      updatedEntry.coverUrl,
      updatedEntry.title,
      updatedEntry.actress,
      updatedEntry.lastUpdated,
      updatedEntry.kinds ? JSON.stringify(updatedEntry.kinds) : null,
      updatedEntry.elo ?? null,
      updatedEntry.matchCount ?? null,
      updatedEntry.winCount ?? null,
      updatedEntry.drawCount ?? null,
      updatedEntry.lossCount ?? null,
      updatedEntry.lastRated ?? null,
      updatedEntry.recentMatches ? JSON.stringify(updatedEntry.recentMatches) : null
    );
}
