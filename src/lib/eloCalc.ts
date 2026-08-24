export type EloResult = "win" | "loss" | "draw";

/**
 * K 因子：场次越少变化越大，加速新影片收敛。
 */
export function getKFactorFromMatchCount(matchCount: number): number {
  if (matchCount < 5) return 48;
  if (matchCount < 20) return 32;
  if (matchCount < 50) return 24;
  return 16;
}

/**
 * 时间修正 K 因子：距上次评分越久，K 越大（生疏了要重新校准）。
 * daysSinceLastRated = 0 时返回原始 K；每过 7 天 K 增加最多 20%（封顶 2 倍）。
 */
export function applyTimeDecayToK(baseK: number, lastRated: number): number {
  if (!lastRated) return baseK;
  const daysSince = (Date.now() - lastRated) / (1000 * 60 * 60 * 24);
  if (daysSince <= 0) return baseK;
  const boost = Math.min(1 + (daysSince / 7) * 0.2, 2);
  return Math.round(baseK * boost);
}

/**
 * 对战后的 sigma 收敛：sigma_new = max(sigma * DECAY, MIN_SIGMA)
 */
export function decaySigma(sigma: number): number {
  const MIN_SIGMA = 50;
  const SIGMA_DECAY = 0.95;
  return Math.max(Math.round(sigma * SIGMA_DECAY), MIN_SIGMA);
}

export interface EloCalculation {
  newEloA: number;
  newEloB: number;
  changeA: number;
  changeB: number;
  kA: number;
  kB: number;
}

/**
 * 标准 Elo 计算。A 赢传 result="win"，B 赢传 "loss"，平局传 "draw"。
 * 可选传入 lastRatedA/B 用于时间修正。
 */
export function calculateElo(
  eloA: number,
  eloB: number,
  matchCountA: number,
  matchCountB: number,
  result: EloResult,
  lastRatedA?: number,
  lastRatedB?: number
): EloCalculation {
  const expectedScoreA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  const expectedScoreB = 1 / (1 + Math.pow(10, (eloA - eloB) / 400));
  let kA = getKFactorFromMatchCount(matchCountA);
  let kB = getKFactorFromMatchCount(matchCountB);

  if (lastRatedA !== undefined) kA = applyTimeDecayToK(kA, lastRatedA);
  if (lastRatedB !== undefined) kB = applyTimeDecayToK(kB, lastRatedB);

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
