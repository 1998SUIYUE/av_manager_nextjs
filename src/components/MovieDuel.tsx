"use client";

/* eslint-disable @next/next/no-img-element */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { MovieData } from "@/app/movies-lazy/page";
import VideoPlayer from "./VideoPlayer";
import { EloRating } from "@/lib/eloRatingCache";

interface MovieDuelProps {
  allMovies: MovieData[];
  onExit: () => void;
}

const RECENT_PAIR_LIMIT = 30;
const ELO_WINDOWS = [150, 250, 400, Infinity];

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

const MovieDuel: React.FC<MovieDuelProps> = ({ allMovies, onExit }) => {
  const [leftMovie, setLeftMovie] = useState<MovieData | null>(null);
  const [rightMovie, setRightMovie] = useState<MovieData | null>(null);
  const [eloRatings, setEloRatings] = useState<Map<string, EloRating>>(new Map());
  const [isPlayingLeft, setIsPlayingLeft] = useState(false);
  const [isPlayingRight, setIsPlayingRight] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const recentPairsRef = useRef<string[]>([]);
  const isInitialDuelSelected = useRef(false);

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
      const secondMovie = pickRandom(shortlist);

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
    [allMovies, eloRatings, onExit]
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
      if (!leftMovie?.code || !rightMovie?.code || isSubmitting) return;
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
    [leftMovie, rightMovie, isSubmitting, eloRatings, rememberPairAndSelectNext, selectNewDuel]
  );
  const handleUndo = useCallback(async () => {
    if (isSubmitting) return;
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
  }, [isSubmitting, selectNewDuel]);
  const handleSkip = useCallback(() => {
    if (isSubmitting) return;
    rememberPairAndSelectNext(eloRatings);
  }, [eloRatings, isSubmitting, rememberPairAndSelectNext]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (isSubmitting || isPlayingLeft || isPlayingRight) return;

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
    [handleRating, handleSkip, handleUndo, isPlayingLeft, isPlayingRight, isSubmitting]
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
      return <div className="h-[520px] w-full animate-pulse border border-[#3e392d] bg-[#211e18]" />;
    }

    const isPlaying = side === "left" ? isPlayingLeft : isPlayingRight;
    const rating = getRating(movie, eloRatings);
    const setPlaying = side === "left" ? setIsPlayingLeft : setIsPlayingRight;

    if (isPlaying) {
      return (
        <div className="h-[62vh] min-h-[420px] border border-[#3e392d] bg-black">
          <VideoPlayer
            src={`/api/video/stream?path=${safeBase64Encode(movie.absolutePath)}`}
            filepath={movie.absolutePath}
            filename={movie.filename}
            onEnded={() => setPlaying(false)}
            autoPlay={false}
          />
        </div>
      );
    }

    return (
      <button type="button" onClick={() => setPlaying(true)} className="block w-full text-left">
        <div className="relative h-[62vh] min-h-[420px] overflow-hidden border border-[#3e392d] bg-[#0f0e0b]">
          <img
            src={movie.coverUrl || "/placeholder-image.svg"}
            alt={movie.displayTitle || movie.title || movie.filename}
            className="h-full w-full object-contain transition duration-500 hover:scale-[1.02]"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-4">
            <div className="text-xs font-bold text-[#e7bd67]">{side === "left" ? "A 选择左侧" : "D 选择右侧"}</div>
            <div className="mt-1 truncate text-lg font-black text-white">{movie.code || movie.filename}</div>
            <div className="mt-1 text-sm text-[#d9cbb4]">
              Elo {rating.elo || 1000} · {rating.matchCount || 0} 场 · 胜{rating.winCount || 0}/负{rating.lossCount || 0}/平{rating.drawCount || 0}
            </div>
          </div>
        </div>
      </button>
    );
  };

  return (
    <main className="fixed inset-0 z-50 overflow-auto bg-[#15130f] text-[#f7f0df]">
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.026)_1px,transparent_1px)] bg-[size:44px_44px]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1680px] flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 border border-[#3e392d] bg-[#211e18]/90 p-4 shadow-xl shadow-black/30 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-[#8f846f]">偏好评分</div>
            <h1 className="mt-1 text-2xl font-black text-[#fff8e7]">影片对战</h1>
            <p className="mt-1 text-sm text-[#b8af9d]">
              优先补齐低场次影片，并尽量匹配 Elo 接近、近期没打过的对手。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <KeyHint k="A" label="左侧胜" />
            <KeyHint k="D" label="右侧胜" />
            <KeyHint k="空格" label="平局" />
            <KeyHint k="S" label="跳过" />
            <KeyHint k="Z" label="悔棋" />
            <button
              type="button"
              onClick={onExit}
              className="border border-[#4a4334] px-4 py-2 text-sm font-black text-[#f7f0df] transition hover:bg-[#2a261d]"
            >
              退出对战
            </button>
          </div>
        </header>

        <section className="grid flex-1 gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
          <div>{renderMovie(leftMovie, "left")}</div>
          <div className="flex flex-col items-stretch gap-2 lg:w-32">
            <DuelButton disabled={isSubmitting} onClick={() => handleRating("left")} tone="gold">
              左侧胜
            </DuelButton>
            <DuelButton disabled={isSubmitting} onClick={() => handleRating("draw")} tone="neutral">
              平局
            </DuelButton>
            <DuelButton disabled={isSubmitting} onClick={() => handleRating("right")} tone="green">
              右侧胜
            </DuelButton>
            <DuelButton disabled={isSubmitting} onClick={handleSkip} tone="neutral">
              跳过
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
  tone,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
  tone: "gold" | "green" | "neutral";
}) {
  const toneClass =
    tone === "gold"
      ? "border-[#d79b43] bg-[#d79b43] text-[#1e160b] hover:bg-[#efb85d]"
      : tone === "green"
      ? "border-[#4fa58b] bg-[#214f45] text-[#dffbf0] hover:bg-[#2c6759]"
      : "border-[#4a4334] bg-[#211e18] text-[#f7f0df] hover:bg-[#2a261d]";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`border px-4 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-55 ${toneClass}`}
    >
      {children}
    </button>
  );
}

function KeyHint({ k, label }: { k: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 border border-[#3e392d] bg-[#15130f] px-2.5 py-1.5 text-xs text-[#c8bdab]">
      <kbd className="border border-[#5d5138] bg-[#2a261d] px-1.5 py-0.5 font-black text-[#e7bd67]">{k}</kbd>
      {label}
    </span>
  );
}

export default MovieDuel;
