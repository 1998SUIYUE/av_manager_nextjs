"use client";

/* eslint-disable @next/next/no-img-element */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { MovieData } from "@/lib/movie-types";
import VideoPlayer from "./VideoPlayer";
import PageBackground from "./PageBackground";
import { EloRating } from "@/lib/eloRatingCache";
import { MARGIN_CSS } from "@/lib/marginStyles";
import { DEFAULT_APPEARANCE, fetchAppearance, type AppearanceSettings } from "@/lib/appearance";

interface MovieDuelProps {
  allMovies: MovieData[];
  onExit: () => void;
  onDelete: (filePath: string) => Promise<void>;
}

const RECENT_PAIR_LIMIT = 30;
const ELO_WINDOWS = [150, 250, 400, Infinity];

// 对战展示封面
const SHOW_COVER = true;

function safeBase64Encode(str: string): string {
  try {
    return btoa(encodeURIComponent(str));
  } catch {
    return encodeURIComponent(str);
  }
}

function getRating(movie: MovieData, ratings: Map<string, EloRating>): EloRating {
  const code = movie.code || "";
  return (
    ratings.get(code) || {
      code,
      elo: movie.elo || 1000,
      matchCount: movie.matchCount || 0,
      winCount: movie.winCount || 0,
      lossCount: movie.lossCount || 0,
      drawCount: movie.drawCount || 0,
      lastRated: 0,
      sigma: 300,
    }
  );
}

function pairKey(codeA: string, codeB: string): string {
  return [codeA, codeB].sort().join("|");
}

function uniqueMoviesByCode(movies: MovieData[]): MovieData[] {
  const seen = new Set<string>();
  const unique: MovieData[] = [];

  for (const movie of movies) {
    if (!movie.code || seen.has(movie.code)) continue;
    seen.add(movie.code);
    unique.push(movie);
  }

  return unique;
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function hasLocalCover(movie: MovieData | null): boolean {
  return Boolean(
    movie?.coverUrl &&
      (movie.coverUrl.startsWith("/api/image-serve/") || movie.coverUrl.startsWith("/image-cache/"))
  );
}

const MovieDuel: React.FC<MovieDuelProps> = ({ allMovies, onExit, onDelete }) => {
  const [leftMovie, setLeftMovie] = useState<MovieData | null>(null);
  const [rightMovie, setRightMovie] = useState<MovieData | null>(null);
  const [eloRatings, setEloRatings] = useState<Map<string, EloRating>>(new Map());
  const [isPlayingLeft, setIsPlayingLeft] = useState(false);
  const [isPlayingRight, setIsPlayingRight] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirmSide, setDeleteConfirmSide] = useState<"left" | "right" | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // 两侧视频真实宽高比：播放容器高度跟随视频，消除上下黑边（上限 62vh）
  const [videoAspects, setVideoAspects] = useState<{ left: number; right: number }>({ left: 16 / 9, right: 16 / 9 });

  // 外观设置与 /movies-v2 同源（服务端持久化），对战页复用同一张背景
  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE);
  const bgActive = appearance.bgMode !== "off";
  useEffect(() => {
    let alive = true;
    fetchAppearance()
      .then((settings) => {
        if (alive) setAppearance(settings);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const recentPairsRef = useRef<string[]>([]);
  const isInitialDuelSelected = useRef(false);
  const deleteConfirmTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const selectOpponentFor = useCallback(
    (firstMovie: MovieData, ratings: Map<string, EloRating>, recentPairs: string[]): MovieData | null => {
      const validMovies = uniqueMoviesByCode(allMovies);
      const firstRating = getRating(firstMovie, ratings);

      let secondPool: MovieData[] = [];
      for (const windowSize of ELO_WINDOWS) {
        secondPool = validMovies.filter((movie) => {
          if (!movie.code || movie.code === firstMovie.code) return false;
          const rating = getRating(movie, ratings);
          const sameRecentPair = recentPairs.includes(pairKey(firstMovie.code!, movie.code));
          return Math.abs((rating.elo || 1000) - (firstRating.elo || 1000)) <= windowSize && !sameRecentPair;
        });
        if (secondPool.length > 0) break;
      }

      if (secondPool.length === 0) {
        secondPool = validMovies.filter((movie) => movie.code && movie.code !== firstMovie.code);
      }

      if (secondPool.length === 0) return null;

      const sortedSecondPool = [...secondPool].sort((a, b) => {
        const ratingA = getRating(a, ratings);
        const ratingB = getRating(b, ratings);
        // 优先高 sigma（不确定度大 → 对局信息量高），其次低场次，最后 Elo 接近
        const sigmaDiff = (ratingB.sigma || 300) - (ratingA.sigma || 300);
        if (sigmaDiff !== 0) return sigmaDiff;
        const countDiff = (ratingA.matchCount || 0) - (ratingB.matchCount || 0);
        if (countDiff !== 0) return countDiff;
        return Math.abs((ratingA.elo || 1000) - (firstRating.elo || 1000)) - Math.abs((ratingB.elo || 1000) - (firstRating.elo || 1000));
      });

      const shortlist = sortedSecondPool.slice(0, Math.min(8, sortedSecondPool.length));
      return pickRandom(shortlist);
    },
    [allMovies]
  );

  const selectNewDuel = useCallback(
    (ratings: Map<string, EloRating> = eloRatings, recentPairs: string[] = recentPairsRef.current) => {
      const validMovies = uniqueMoviesByCode(allMovies);

      if (validMovies.length < 2) {
        alert("可参与对战的影片不足两部");
        onExit();
        return;
      }

      let minMatchCount = Infinity;
      for (const movie of validMovies) {
        const count = getRating(movie, ratings).matchCount || 0;
        if (count < minMatchCount) minMatchCount = count;
      }

      const primaryPool = validMovies.filter((movie) => (getRating(movie, ratings).matchCount || 0) === minMatchCount);
      const firstMovie = pickRandom(primaryPool.length > 0 ? primaryPool : validMovies);

      const secondMovie = selectOpponentFor(firstMovie, ratings, recentPairs);
      if (!secondMovie) {
        alert("可参与对战的影片不足两部");
        onExit();
        return;
      }

      if (Math.random() > 0.5) {
        setLeftMovie(firstMovie);
        setRightMovie(secondMovie);
      } else {
        setLeftMovie(secondMovie);
        setRightMovie(firstMovie);
      }

      setIsPlayingLeft(false);
      setIsPlayingRight(false);
    },
    [allMovies, eloRatings, onExit, selectOpponentFor]
  );

  useEffect(() => {
    const fetchEloRatings = async () => {
      try {
        const response = await fetch("/api/elo-ratings");
        if (!response.ok) throw new Error("无法读取 Elo 评分");
        const ratingsArray: EloRating[] = await response.json();
        const ratingsMap = new Map(ratingsArray.map((rating) => [rating.code, rating]));
        setEloRatings(ratingsMap);
        if (!isInitialDuelSelected.current && allMovies.length > 0) {
          selectNewDuel(ratingsMap);
          isInitialDuelSelected.current = true;
        }
      } catch (error) {
        console.error("加载 Elo 评分失败:", error);
        setEloRatings(new Map());
      }
    };
    fetchEloRatings();
    // selectNewDuel is intentionally called with the freshly fetched ratingsMap.
    // Adding it here would cause this initialization fetch to repeat when ratings state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMovies.length]);

  useEffect(() => {
    if (allMovies.length > 0 && !isInitialDuelSelected.current) {
      selectNewDuel();
      isInitialDuelSelected.current = true;
    }
  }, [allMovies.length, selectNewDuel]);

  const rememberPairAndSelectNext = useCallback(
    (ratings: Map<string, EloRating>) => {
      if (leftMovie?.code && rightMovie?.code) {
        recentPairsRef.current = [pairKey(leftMovie.code, rightMovie.code), ...recentPairsRef.current].slice(0, RECENT_PAIR_LIMIT);
      }
      selectNewDuel(ratings, recentPairsRef.current);
    },
    [leftMovie?.code, rightMovie?.code, selectNewDuel]
  );


  const handleRating = useCallback(
    async (winner: "left" | "right" | "draw") => {
      if (!leftMovie?.code || !rightMovie?.code || isSubmitting || isDeleting) return;
      if (leftMovie.code === rightMovie.code) {
        selectNewDuel();
        return;
      }

      setIsSubmitting(true);
      const resultString: "winA" | "winB" | "draw" =
        winner === "left" ? "winA" : winner === "right" ? "winB" : "draw";

      try {
        const response = await fetch("/api/elo-ratings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            codeA: leftMovie.code,
            codeB: rightMovie.code,
            result: resultString,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "更新评分失败");
        }

        const { updatedRatingA, updatedRatingB } = await response.json();
        const nextRatings = new Map(eloRatings);
        nextRatings.set(updatedRatingA.code, updatedRatingA);
        nextRatings.set(updatedRatingB.code, updatedRatingB);

        setEloRatings(nextRatings);
        rememberPairAndSelectNext(nextRatings);
      } catch (error) {
        console.error("更新 Elo 评分失败:", error);
        alert(`更新评分失败：${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setIsSubmitting(false);
      }
    },
    [leftMovie, rightMovie, isSubmitting, isDeleting, eloRatings, rememberPairAndSelectNext, selectNewDuel]
  );
  const handleUndo = useCallback(async () => {
    if (isSubmitting || isDeleting) return;
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/elo-ratings", { method: "DELETE" });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "撤销失败");
      }

      const { reverted } = await response.json();
      const ratingsResponse = await fetch("/api/elo-ratings");
      if (!ratingsResponse.ok) throw new Error("刷新评分失败");
      const ratingsArray: EloRating[] = await ratingsResponse.json();
      const nextRatings = new Map(ratingsArray.map((rating) => [rating.code, rating]));
      setEloRatings(nextRatings);

      // 撤销的对局不再算"近期打过"，从去重记录里移除
      recentPairsRef.current = recentPairsRef.current.filter(
        (key) => key !== pairKey(reverted.codeA, reverted.codeB)
      );
      selectNewDuel(nextRatings, recentPairsRef.current);
    } catch (error) {
      console.error("撤销对局失败:", error);
      alert(`撤销失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, isDeleting, selectNewDuel]);
  const handleSkip = useCallback(() => {
    if (isSubmitting || isDeleting) return;
    rememberPairAndSelectNext(eloRatings);
  }, [eloRatings, isSubmitting, isDeleting, rememberPairAndSelectNext]);

  // 保留另一侧擂主，仅替换 side 侧的影片（用于删除后的补位）
  const replaceMovieOnSide = useCallback(
    (side: "left" | "right") => {
      const keptMovie = side === "left" ? rightMovie : leftMovie;
      if (!keptMovie) {
        selectNewDuel();
        return;
      }

      const validMovies = uniqueMoviesByCode(allMovies);
      if (validMovies.length < 2) {
        selectNewDuel(); // 内部会提示影片不足并退出
        return;
      }

      const opponent = selectOpponentFor(keptMovie, eloRatings, recentPairsRef.current);
      if (!opponent) {
        selectNewDuel();
        return;
      }

      if (side === "left") {
        setLeftMovie(opponent);
        setIsPlayingLeft(false);
      } else {
        setRightMovie(opponent);
        setIsPlayingRight(false);
      }
    },
    [leftMovie, rightMovie, allMovies, eloRatings, selectNewDuel, selectOpponentFor]
  );

  // 影片从影库中被删除后（对战页内删除或外部删除），为被删一侧补位新对手
  useEffect(() => {
    if (!leftMovie && !rightMovie) return;
    const paths = new Set(allMovies.map((m) => m.absolutePath));
    const leftGone = Boolean(leftMovie && !paths.has(leftMovie.absolutePath));
    const rightGone = Boolean(rightMovie && !paths.has(rightMovie.absolutePath));
    if (!leftGone && !rightGone) return;

    if (leftGone && rightGone) {
      selectNewDuel();
    } else if (leftGone) {
      replaceMovieOnSide("left");
    } else {
      replaceMovieOnSide("right");
    }
  }, [allMovies, leftMovie, rightMovie, selectNewDuel, replaceMovieOnSide]);

  const handleDeleteClick = useCallback(
    async (side: "left" | "right", e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const movie = side === "left" ? leftMovie : rightMovie;
      if (!movie || isDeleting || isSubmitting) return;

      if (deleteConfirmTimeoutRef.current) {
        clearTimeout(deleteConfirmTimeoutRef.current);
        deleteConfirmTimeoutRef.current = null;
      }

      if (deleteConfirmSide === side) {
        // 第二次点击：确认删除，对局补位由 allMovies 变化的 effect 处理
        setDeleteConfirmSide(null);
        setIsDeleting(true);
        try {
          await onDelete(movie.absolutePath);
        } catch (error) {
          alert(`删除影片“${movie.filename}”失败：${error instanceof Error ? error.message : String(error)}`);
        } finally {
          setIsDeleting(false);
        }
      } else {
        // 第一次点击：进入确认态，4 秒未确认自动取消
        setDeleteConfirmSide(side);
        deleteConfirmTimeoutRef.current = setTimeout(() => {
          setDeleteConfirmSide(null);
          deleteConfirmTimeoutRef.current = null;
        }, 4000);
      }
    },
    [deleteConfirmSide, isDeleting, isSubmitting, leftMovie, rightMovie, onDelete]
  );

  useEffect(() => {
    return () => {
      if (deleteConfirmTimeoutRef.current) {
        clearTimeout(deleteConfirmTimeoutRef.current);
      }
    };
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (isSubmitting || isDeleting || isPlayingLeft || isPlayingRight) return;

      switch (event.code) {
        case "KeyA":
          handleRating("left");
          break;
        case "KeyD":
          handleRating("right");
          break;
        case "Space":
          event.preventDefault();
          handleRating("draw");
          break;
        case "KeyS":
          handleSkip();
          break;
        case "KeyZ":
          void handleUndo();
          break;
        default:
          break;
      }
    },
    [handleRating, handleSkip, handleUndo, isPlayingLeft, isPlayingRight, isSubmitting, isDeleting]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    const hydrateMovieDetails = async (movie: MovieData | null, side: "left" | "right") => {
      if (!movie?.code || hasLocalCover(movie)) return;

      try {
        const response = await fetch(`/api/movie-details/${movie.code}`);
        if (!response.ok) return;

        const details: Partial<MovieData> = await response.json();
        const setMovie = side === "left" ? setLeftMovie : setRightMovie;
        setMovie((current) =>
          current?.absolutePath === movie.absolutePath
            ? {
                ...current,
                ...details,
                title: details.title || current.title,
              }
            : current
        );
      } catch (error) {
        console.error(`加载对战影片详情失败: ${movie.code}`, error);
      }
    };

    hydrateMovieDetails(leftMovie, "left");
    hydrateMovieDetails(rightMovie, "right");
  }, [leftMovie, rightMovie]);

  const renderMovie = (movie: MovieData | null, side: "left" | "right") => {
    if (!movie) {
      return <div className="h-[62vh] min-h-[420px] w-full animate-pulse rounded-2xl bg-surface" />;
    }

    const isPlaying = side === "left" ? isPlayingLeft : isPlayingRight;
    const rating = getRating(movie, eloRatings);
    const setPlaying = side === "left" ? setIsPlayingLeft : setIsPlayingRight;
    const isConfirmingDelete = deleteConfirmSide === side;
    const keyHint = side === "left" ? "A" : "D";

    // 删除按钮与删除中覆盖层：封面态与播放态共用
    const deleteButton = (
      <button
        type="button"
        onClick={(e) => handleDeleteClick(side, e)}
        className={`absolute right-3 top-3 z-30 grid h-9 w-9 place-items-center rounded-lg backdrop-blur transition ${
          isConfirmingDelete
            ? "bg-danger-strong text-white"
            : "border border-white/15 bg-black/45 text-white/85 hover:border-danger/50 hover:text-danger"
        }`}
        aria-label={isConfirmingDelete ? "确认删除影片" : "删除影片"}
        title={isConfirmingDelete ? "再次点击确认删除" : "删除影片"}
      >
        {isConfirmingDelete ? (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M6 6l1 15h10l1-15" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        )}
      </button>
    );
    const deletingOverlay = isDeleting ? (
      <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/85 text-white">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" />
        <span className="mt-3 text-sm">删除中...</span>
      </div>
    ) : null;

    if (isPlaying) {
      return (
        <div
          className="hair relative w-full overflow-hidden rounded-2xl bg-black"
          style={{ aspectRatio: videoAspects[side], maxHeight: "62vh" }}
        >
          <VideoPlayer
            src={`/api/video/stream?path=${safeBase64Encode(movie.absolutePath)}`}
            filepath={movie.absolutePath}
            filename={movie.filename}
            onEnded={() => setPlaying(false)}
            onLoadedMetadata={({ width, height }) =>
              setVideoAspects((prev) =>
                prev[side] === width / height ? prev : { ...prev, [side]: width / height }
              )
            }
            autoPlay={false}
          />
          {deleteButton}
          {deletingOverlay}
        </div>
      );
    }

    const handleCardClick = () => {
      if (deleteConfirmSide) {
        // 点击卡片其他区域取消删除确认
        setDeleteConfirmSide(null);
        if (deleteConfirmTimeoutRef.current) {
          clearTimeout(deleteConfirmTimeoutRef.current);
          deleteConfirmTimeoutRef.current = null;
        }
      } else {
        setPlaying(true);
      }
    };

    return (
      <div onClick={handleCardClick} className="block w-full cursor-pointer text-left">
        <div className={`hair relative h-[62vh] min-h-[420px] overflow-hidden rounded-2xl bg-deep ${isConfirmingDelete ? "opacity-60" : ""}`}>
          {SHOW_COVER ? (
            <img
              src={movie.coverUrl || "/placeholder-image.svg"}
              alt={movie.displayTitle || movie.title || movie.filename}
              className="h-full w-full object-contain transition duration-500 hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center p-8 text-center">
              <div className="line-clamp-4 max-w-lg text-sm leading-6 text-white/70">
                {movie.displayTitle || movie.title || movie.filename}
              </div>
              <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-white/30">
                点击播放
              </div>
            </div>
          )}
          {deleteButton}
          {deletingOverlay}

          {/* 键位提示浮层 */}
          <div className="pointer-events-none absolute left-3 top-3 z-20">
            <kbd className="rounded-md border border-white/20 bg-black/55 px-2 py-1 font-mono text-xs text-white/85 backdrop-blur">
              {keyHint}
            </kbd>
          </div>

          {/* 底部信息浮层 */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-5 pt-10">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
              {side === "left" ? "Side A · 左侧" : "Side B · 右侧"}
            </div>
            <div className="mt-1 truncate font-mono text-lg font-medium text-white" title={movie.code || movie.filename}>
              {movie.code || movie.filename}
            </div>
            <div className="mt-1 font-mono text-xs text-white/60">
              Elo {rating.elo || 1000} · {rating.matchCount || 0} 场 · 胜{rating.winCount || 0} / 负{rating.lossCount || 0} / 平{rating.drawCount || 0}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <main className={`app-no-drag fixed inset-0 z-50 overflow-auto font-sans text-ink antialiased no-scrollbar ${bgActive ? "" : "bg-canvas"}`}>
      <style>{MARGIN_CSS}</style>
      {/* 窗口拖拽条（Electron 无边框模式下顶部拖动；浏览器里只是留白） */}
      <div className="app-drag absolute inset-x-0 top-0 z-[55] h-12" />
      <PageBackground
        mode={appearance.bgMode}
        intensity={appearance.bgIntensity}
        imageUrl={appearance.bgImageUrl}
      />
      <div className="relative mx-auto flex min-h-full w-full flex-col gap-5 px-4 pb-6 pt-[72px] sm:px-6 lg:px-8">
        {/* ===== 头部 ===== */}
        <header className="hair glass rounded-2xl p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-faint">
                ELO Duel · 偏好评分
              </div>
              <h1 className="mt-2 font-serif text-4xl tracking-wide text-ink">影片对战</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
                优先补齐低场次影片，并尽量匹配 Elo 接近、近期没打过的对手。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <KeyHint k="A" label="左胜" />
              <KeyHint k="D" label="右胜" />
              <KeyHint k="空格" label="平局" />
              <KeyHint k="S" label="跳过" />
              <KeyHint k="Z" label="悔棋" />
              <button
                type="button"
                onClick={onExit}
                className="rounded-lg border border-line-strong bg-chip px-4 py-2 text-sm text-ink transition hover:border-accent/60 hover:text-accent active:translate-y-px"
              >
                退出对战
              </button>
            </div>
          </div>
        </header>

        {/* ===== 对局区 ===== */}
        <section className="grid flex-1 gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
          <div>{renderMovie(leftMovie, "left")}</div>

          <div className="hair glass flex flex-col items-stretch gap-2 rounded-2xl p-3 lg:w-40">
            <span className="text-center font-serif text-2xl italic tracking-wide text-faint">vs</span>
            <DuelButton disabled={isSubmitting || isDeleting} onClick={() => handleRating("left")} kbd="A">
              左侧胜
            </DuelButton>
            <DuelButton disabled={isSubmitting || isDeleting} onClick={() => handleRating("draw")} kbd="空格">
              平局
            </DuelButton>
            <DuelButton disabled={isSubmitting || isDeleting} onClick={() => handleRating("right")} kbd="D">
              右侧胜
            </DuelButton>
            <div className="my-1 h-px bg-[rgba(255,255,255,0.08)]" />
            <DuelButton disabled={isSubmitting || isDeleting} onClick={handleSkip} kbd="S">
              跳过
            </DuelButton>
            <DuelButton disabled={isSubmitting || isDeleting} onClick={() => void handleUndo()} kbd="Z">
              悔棋
            </DuelButton>
          </div>

          <div>{renderMovie(rightMovie, "right")}</div>
        </section>
      </div>
    </main>
  );
};

function DuelButton({
  children,
  disabled,
  onClick,
  kbd,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
  kbd: string;
}) {
  // 与头部"退出对战"按钮同风格：chip 底 + line-strong 边框，hover 变 accent
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center justify-between gap-2 rounded-lg border border-line-strong bg-chip px-4 py-3 text-sm font-medium text-ink shadow-[inset_0_1px_0_rgba(255,255,255,.09)] backdrop-blur-md transition hover:border-accent/60 hover:text-accent active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
    >
      <span>{children}</span>
      <kbd className="rounded-md bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-muted">
        {kbd}
      </kbd>
    </button>
  );
}

function KeyHint({ k, label }: { k: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted">
      <kbd className="rounded border border-line bg-chip px-1.5 py-0.5 text-[10px] text-ink">{k}</kbd>
      {label}
    </span>
  );
}

export default MovieDuel;
