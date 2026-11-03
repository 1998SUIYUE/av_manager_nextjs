// /movies-v2 设计稿专用 mock 数据源（纯前端、零图片引用）
// - 封面为程序生成的内联 SVG dataURI（确定性：同一部影片每次生成结果一致）
// - 接回真实数据：把 movies-v2/page.tsx 顶部的 USE_MOCK 改为 false 即可

export interface MockMovieData {
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

// 确定性伪随机（mulberry32），保证 mock 稳定可复现
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LABELS = ["MRGN", "AVML", "DSKU", "PXAV", "MGLB"];

const TITLE_A = [
  "深夜书房的", "雨后天台的", "旧录像带里的", "午前零时的", "蓝色房间与",
  "便利店夜班的", "海边小屋的", "末班电车里的", "阁楼储物间的", "假日酒店的",
  "滑雪木屋的", "旧公寓二楼的",
];

const TITLE_B = [
  "访客", "约定", "独白", "温度", "记录", "旅程", "窥视", "告白", "沉默", "练习", "假期", "秘密",
];

const ACTRESSES = [
  "白瀬ゆき", "朝比奈みお", "鳴海すず", "東雲あかね", "南条かりん",
  "氷室れん", "宇佐美のの", "花城あむ", "白石ねる", "綾瀬ひまり",
];

const KINDS = ["高清", "中文字幕", "4K", "独占", "经典", "企划", "薄码", "合集"];

// 内联 SVG 封面：近黑渐变 + 辉光 + 发丝线内框 + mono 番号（无任何外部图片引用）
function buildCoverSvg(code: string, index: number): string {
  const hue = (200 + index * 47) % 360;
  const hue2 = (hue + 42) % 360;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">` +
    `<defs>` +
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue} 22% 17%)"/>` +
    `<stop offset="1" stop-color="hsl(${hue2} 18% 9%)"/>` +
    `</linearGradient>` +
    `<radialGradient id="r" cx="0.32" cy="0.24" r="0.85">` +
    `<stop offset="0" stop-color="hsl(${hue} 45% 42%)" stop-opacity="0.34"/>` +
    `<stop offset="1" stop-color="#000000" stop-opacity="0"/>` +
    `</radialGradient>` +
    `</defs>` +
    `<rect width="600" height="900" fill="url(#g)"/>` +
    `<rect width="600" height="900" fill="url(#r)"/>` +
    `<rect x="14" y="14" width="572" height="872" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="1"/>` +
    `<text x="302" y="78" text-anchor="middle" font-family="Menlo,Consolas,monospace" font-size="19" letter-spacing="10" fill="rgba(255,255,255,0.26)">MARGIN MOCK</text>` +
    `<text x="302" y="838" text-anchor="middle" font-family="Menlo,Consolas,monospace" font-size="36" letter-spacing="5" fill="rgba(255,255,255,0.5)">${code}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildMockMovies(): MockMovieData[] {
  const rand = mulberry32(20261103);
  const now = Date.now();
  const DAY = 86400000;

  const movies: MockMovieData[] = Array.from({ length: 56 }, (_, i) => {
    const code = `${LABELS[i % LABELS.length]}-${String(101 + Math.floor(rand() * 820)).padStart(3, "0")}`;
    const title = `${TITLE_A[i % TITLE_A.length]}${TITLE_B[(i * 7 + Math.floor(rand() * 12)) % TITLE_B.length]}`;
    const sizeInGB = 1.2 + rand() * 11.8;
    const modifiedAt = now - Math.floor(rand() * 300) * DAY - Math.floor(rand() * 86400);
    const year = String(2018 + Math.floor(rand() * 8));
    const hasActress = rand() > 0.12;
    const actress = hasActress ? ACTRESSES[Math.floor(rand() * ACTRESSES.length)] : null;

    const kindCount = 1 + Math.floor(rand() * 3);
    const kinds: string[] = [];
    for (let k = 0; k < kindCount; k++) {
      const kind = KINDS[Math.floor(rand() * KINDS.length)];
      if (!kinds.includes(kind)) kinds.push(kind);
    }

    const playCount = rand() < 0.45 ? 1 + Math.floor(rand() * 5) : 0;
    const progress = playCount > 0 ? (rand() < 0.38 ? 1 : 0.05 + rand() * 0.85) : 0;
    const watched = progress >= 0.98;
    const lastPlayedAt = playCount > 0 ? now - Math.floor(rand() * 30) * DAY - Math.floor(rand() * 43200) : undefined;
    const durationSec = 5400 + Math.floor(rand() * 7200);

    const matchCount = rand() < 0.5 ? 2 + Math.floor(rand() * 16) : 0;
    const winCount = matchCount > 0 ? Math.floor(matchCount * (0.3 + rand() * 0.55)) : 0;
    const drawCount = matchCount > 0 ? Math.floor(rand() * Math.max(1, matchCount - winCount)) : 0;
    const lossCount = matchCount > 0 ? matchCount - winCount - drawCount : 0;

    return {
      filename: `${code} ${title}.mp4`,
      path: `/mock/library/${code}.mp4`,
      absolutePath: `D:\\mock\\library\\${code}.mp4`,
      size: Math.round(sizeInGB * 1024 * 1024 * 1024),
      sizeInGB: Number(sizeInGB.toFixed(2)),
      extension: ".mp4",
      title,
      year,
      code,
      modifiedAt,
      coverUrl: buildCoverSvg(code, i),
      displayTitle: title,
      actress,
      kinds,
      elo: matchCount > 0 ? Math.round(980 + winRateOf(winCount, matchCount) * 260 + rand() * 40) : Math.round(940 + rand() * 90),
      matchCount,
      winCount,
      drawCount,
      lossCount,
      winRate: matchCount > 0 ? Number((winCount / matchCount).toFixed(3)) : undefined,
      lastPlayedAt,
      playCount,
      completedCount: watched ? playCount : Math.max(0, playCount - 1),
      lastPlaybackTime: watched ? durationSec : playCount > 0 ? Math.round(durationSec * progress) : 0,
      playbackDuration: durationSec,
      playbackProgress: Number(progress.toFixed(3)),
      watched,
    };
  });

  // 制造两组番号重复，方便设计走查"重复影片"面板
  movies[9].code = movies[3].code;
  movies[9].filename = movies[9].filename.replace(/^[A-Z]+-\d+/, movies[3].code || "");
  movies[21].code = movies[14].code;
  movies[21].filename = movies[21].filename.replace(/^[A-Z]+-\d+/, movies[14].code || "");

  return movies;
}

function winRateOf(winCount: number, matchCount: number): number {
  return matchCount > 0 ? winCount / matchCount : 0;
}
