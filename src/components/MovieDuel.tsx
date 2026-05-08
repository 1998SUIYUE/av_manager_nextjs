"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { MovieData } from "@/app/movies-lazy/page";
import VideoPlayer from "./VideoPlayer";
import { EloRating } from "@/lib/eloRatingCache";

interface MovieDuelProps {
  allMovies: MovieData[];
  onExit: () => void;
}

function safeBase64Encode(str: string): string {
  try {
    return btoa(encodeURIComponent(str));
  } catch {
    return encodeURIComponent(str);
  }
}

const MovieDuel: React.FC<MovieDuelProps> = ({ allMovies, onExit }) => {
  const [leftMovie, setLeftMovie] = useState<MovieData | null>(null);
  const [rightMovie, setRightMovie] = useState<MovieData | null>(null);
  const [eloRatings, setEloRatings] = useState<Map<string, EloRating>>(new Map());
  const [isPlayingLeft, setIsPlayingLeft] = useState<boolean>(false);
  const [isPlayingRight, setIsPlayingRight] = useState<boolean>(false);
  const isInitialDuelSelected = useRef(false);

  useEffect(() => {
    const fetchEloRatings = async () => {
      try {
        const response = await fetch("/api/elo-ratings");
        if (!response.ok) throw new Error("无法读取 Elo 评分");
        const ratingsArray: EloRating[] = await response.json();
        setEloRatings(new Map(ratingsArray.map((r: EloRating) => [r.code, r])));
      } catch (error) {
        console.error("加载 Elo 评分失败:", error);
        setEloRatings(new Map());
      }
    };
    fetchEloRatings();
  }, []);

  const selectNewDuel = useCallback(() => {
    const validMovies = allMovies.filter((movie) => movie.code);

    if (validMovies.length < 2) {
      alert("可参与对战的影片不足两部");
      onExit();
      return;
    }

    let minMatchCount = Infinity;
    for (const movie of validMovies) {
      const count = eloRatings.get(movie.code!)?.matchCount || 0;
      if (count < minMatchCount) {
        minMatchCount = count;
      }
    }

    let leastRatedPool = validMovies.filter(
      (movie) => (eloRatings.get(movie.code!)?.matchCount || 0) === minMatchCount
    );

    if (leastRatedPool.length < 2) {
      leastRatedPool = validMovies;
      if (leastRatedPool.length < 2) {
        alert("可参与对战的影片不足两部");
        onExit();
        return;
      }
    }

    let index1 = Math.floor(Math.random() * leastRatedPool.length);
    let index2 = Math.floor(Math.random() * (leastRatedPool.length - 1));
    if (index2 >= index1) {
      index2++;
    }

    setLeftMovie(leastRatedPool[index1]);
    setRightMovie(leastRatedPool[index2]);
    setIsPlayingLeft(false);
    setIsPlayingRight(false);
  }, [allMovies, eloRatings, onExit]);

  useEffect(() => {
    if (allMovies.length > 0 && !isInitialDuelSelected.current) {
      selectNewDuel();
      isInitialDuelSelected.current = true;
    }
  }, [allMovies, selectNewDuel]);

  const handleRating = useCallback(
    async (winner: "left" | "right" | "draw") => {
      if (!leftMovie?.code || !rightMovie?.code) return;

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

        setEloRatings((prev) => {
          const newRatings = new Map(prev);
          newRatings.set(updatedRatingA.code, updatedRatingA);
          newRatings.set(updatedRatingB.code, updatedRatingB);
          return newRatings;
        });

        selectNewDuel();
      } catch (error) {
        console.error("更新 Elo 评分失败:", error);
        alert(`更新评分失败：${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [leftMovie, rightMovie, selectNewDuel]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
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
        default:
          break;
      }
    },
    [handleRating]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  const renderMovie = (movie: MovieData | null, side: "left" | "right") => {
    if (!movie) {
      return <div className="h-[520px] w-full animate-pulse border border-[#3e392d] bg-[#211e18]" />;
    }

    const isPlaying = side === "left" ? isPlayingLeft : isPlayingRight;
    const rating = movie.code ? eloRatings.get(movie.code) : undefined;
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
            <div className="mt-1 text-sm text-[#d9cbb4]">Elo {rating?.elo || movie.elo || 1000}</div>
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
            <p className="mt-1 text-sm text-[#b8af9d]">点击封面可预览，选择更喜欢的一侧会自动进入下一轮。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <KeyHint k="A" label="左侧胜" />
            <KeyHint k="D" label="右侧胜" />
            <KeyHint k="空格" label="平局" />
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
            <button
              type="button"
              onClick={() => handleRating("left")}
              className="border border-[#d79b43] bg-[#d79b43] px-4 py-3 text-sm font-black text-[#1e160b] transition hover:bg-[#efb85d]"
            >
              左侧胜
            </button>
            <button
              type="button"
              onClick={() => handleRating("draw")}
              className="border border-[#4a4334] bg-[#211e18] px-4 py-3 text-sm font-black text-[#f7f0df] transition hover:bg-[#2a261d]"
            >
              平局
            </button>
            <button
              type="button"
              onClick={() => handleRating("right")}
              className="border border-[#4fa58b] bg-[#214f45] px-4 py-3 text-sm font-black text-[#dffbf0] transition hover:bg-[#2c6759]"
            >
              右侧胜
            </button>
          </div>
          <div>{renderMovie(rightMovie, "right")}</div>
        </section>
      </div>
    </main>
  );
};

function KeyHint({ k, label }: { k: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 border border-[#3e392d] bg-[#15130f] px-2.5 py-1.5 text-xs text-[#c8bdab]">
      <kbd className="border border-[#5d5138] bg-[#2a261d] px-1.5 py-0.5 font-black text-[#e7bd67]">{k}</kbd>
      {label}
    </span>
  );
}

export default MovieDuel;
