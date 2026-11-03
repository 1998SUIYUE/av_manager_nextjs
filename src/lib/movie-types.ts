// 影片数据共享类型（原分散在 movies-lazy / movies-v2 页面内，统一收口）
export interface MovieData {
  filename: string;
  path: string;
  absolutePath: string;
  size: number;
  sizeInGB: number;
  extension: string;
  title: string;
  year?: string;
  code?: string;
  modifiedAt: number;
  coverUrl?: string | null;
  displayTitle?: string;
  actress?: string | null;
  kinds?: string[];
  elo?: number;
  matchCount?: number;
  winCount?: number;
  drawCount?: number;
  lossCount?: number;
  winRate?: number;
  lastPlayedAt?: number;
  playCount?: number;
  completedCount?: number;
  lastPlaybackTime?: number;
  playbackDuration?: number;
  playbackProgress?: number;
  watched?: boolean;
}
