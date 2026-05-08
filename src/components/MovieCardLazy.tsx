/* eslint-disable @next/next/no-img-element */
"use client";

import React, { memo, useState, useEffect, useRef, useCallback } from "react";
import { formatFileSize } from "@/utils/formatFileSize";
import { devWithTimestamp } from "@/utils/logger";

interface BaseMovieData {
  filename: string;
  path: string;
  absolutePath: string;
  size: number;
  sizeInGB: number;
  extension: string;
  title: string;
  year?: string;
  modifiedAt: number;
  code?: string;
  lastPlayedAt?: number;
  playCount?: number;
  completedCount?: number;
  lastPlaybackTime?: number;
  playbackDuration?: number;
  playbackProgress?: number;
  watched?: boolean;
}

interface MovieDetails extends BaseMovieData {
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
}

interface MovieCardLazyProps {
  movie: BaseMovieData;
  onMovieClick: (absolutePath: string) => void;
  onLoaded: () => void;
  onDetailsLoaded: (details: MovieDetails) => void;
  onDelete: (filePath: string) => Promise<void>;
}

const MovieCardLazy: React.FC<MovieCardLazyProps> = ({
  movie,
  onMovieClick,
  onLoaded,
  onDetailsLoaded,
  onDelete,
}) => {
  const hasLoadedDetails = Boolean(
    (movie as MovieDetails).coverUrl &&
      ((movie as MovieDetails).coverUrl?.startsWith("/api/image-serve/") ||
        (movie as MovieDetails).coverUrl?.startsWith("/image-cache/"))
  );
  const [details, setDetails] = useState<MovieDetails | null>(
    hasLoadedDetails ? (movie as MovieDetails) : null
  );
  const [isLoading, setIsLoading] = useState(!details);
  const [error, setError] = useState<string | null>(null);
  const fetchInitiatedRef = useRef(hasLoadedDetails);

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const confirmTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
      }
    };
  }, []);

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.currentTarget;
    if (target.src !== window.location.origin + "/placeholder-image.svg") {
      target.src = "/placeholder-image.svg";
    }
  };

  const handleDeleteClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();

      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
        confirmTimeoutRef.current = null;
      }

      if (isConfirmingDelete) {
        setIsDeleting(true);
        try {
          await onDelete(movie.absolutePath);
        } catch (err) {
          console.error("删除失败:", err);
          alert(`删除文件“${movie.filename}”失败。`);
          setIsDeleting(false);
          setIsConfirmingDelete(false);
        }
      } else {
        setIsConfirmingDelete(true);
        confirmTimeoutRef.current = setTimeout(() => {
          setIsConfirmingDelete(false);
          confirmTimeoutRef.current = null;
        }, 4000);
      }
    },
    [isConfirmingDelete, onDelete, movie.absolutePath, movie.filename]
  );

  const handleCardClick = () => {
    if (isConfirmingDelete) {
      setIsConfirmingDelete(false);
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
        confirmTimeoutRef.current = null;
      }
    } else {
      onMovieClick(movie.absolutePath);
    }
  };

  useEffect(() => {
    if (fetchInitiatedRef.current) {
      onLoaded();
      return;
    }
    fetchInitiatedRef.current = true;

    if (!movie.code) {
      setIsLoading(false);
      setDetails(movie as MovieDetails);
      onLoaded();
      return;
    }

    const fetchDetails = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/movie-details/${movie.code}`);
        if (!response.ok) {
          const err = new Error(`API Error: ${response.status} ${response.statusText}`);
          devWithTimestamp(`[movie-details] 请求失败 code=${movie.code}:`, err.message);
          throw err;
        }
        const data: MovieDetails = await response.json();
        setDetails(data);
        onDetailsLoaded(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "未知错误");
        devWithTimestamp(
          `[movie-details] 详情加载失败 code=${movie.code}:`,
          e instanceof Error ? e.message : String(e)
        );
      } finally {
        setIsLoading(false);
        onLoaded();
      }
    };

    fetchDetails();
  }, [movie, onLoaded, onDetailsLoaded]);

  if (isLoading) {
    return (
      <div className="overflow-hidden border border-[#3e392d] bg-[#211e18]">
        <div className="h-[260px] animate-pulse bg-[#2a261d] sm:h-[280px] 2xl:h-[220px]" />
        <div className="space-y-3 p-3">
          <div className="h-4 w-3/4 animate-pulse bg-[#3a3326]" />
          <div className="h-3 w-1/2 animate-pulse bg-[#3a3326]" />
        </div>
      </div>
    );
  }

  const title = details ? details.displayTitle || details.title : movie.title || movie.filename;
  const matchCount = details?.matchCount || 0;
  const playbackProgress = movie.playbackProgress || 0;
  const playCount = movie.playCount || 0;
  const winRate =
    details?.winRate !== undefined
      ? details.winRate
      : matchCount > 0
      ? (details?.winCount || 0) / matchCount
      : undefined;

  return (
    <article
      className="group relative overflow-hidden border border-[#3e392d] bg-[#211e18] shadow-xl shadow-black/25 transition duration-300 hover:-translate-y-0.5 hover:border-[#d79b43] hover:shadow-2xl hover:shadow-black/40"
      onClick={handleCardClick}
    >
      <button
        type="button"
        onClick={handleDeleteClick}
        className={`absolute right-2 top-2 z-20 grid h-9 w-9 place-items-center border text-white shadow-lg transition ${
          isConfirmingDelete
            ? "border-[#ff8c7c] bg-[#a73027]"
            : "border-white/15 bg-black/55 backdrop-blur hover:bg-[#3a1d19]"
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

      {isDeleting && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#070604]/82 text-white">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" />
          <span className="mt-3 text-sm font-bold">删除中...</span>
        </div>
      )}

      <div className={`relative flex h-[260px] items-center justify-center bg-[#0f0e0b] sm:h-[280px] 2xl:h-[185px] ${isConfirmingDelete ? "opacity-45" : ""}`}>
        <div className="absolute left-2 top-2 z-10 border border-black/40 bg-[#e7bd67] px-2 py-1 text-[11px] font-black text-[#1b160f]">
          {movie.code || movie.extension.toUpperCase()}
        </div>

        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/0 opacity-0 transition duration-300 group-hover:bg-black/35 group-hover:opacity-100">
          <div className="grid h-14 w-14 place-items-center border border-white/30 bg-white/12 text-white backdrop-blur">
            <svg className="ml-1 h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>

        <img
          src={details?.coverUrl || "/placeholder-image.svg"}
          alt={title}
          className="h-full w-full object-contain transition duration-500 group-hover:scale-[1.025]"
          onError={handleImageError}
        />
      </div>

      <div className={`space-y-3 p-3 ${isConfirmingDelete ? "opacity-45" : ""}`}>
        <div>
          <h2 className="line-clamp-2 min-h-[2.5rem] text-sm font-black leading-5 text-[#fff8e7]" title={title}>
            {title}
          </h2>
          <p className="mt-1 truncate text-xs text-[#8f846f]" title={movie.filename}>
            {movie.code ? `番号: ${movie.code}` : movie.filename}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {movie.watched && <Tag label="已看过" tone="green" />}
          {!movie.watched && playbackProgress > 0.02 && <Tag label={`看到 ${(playbackProgress * 100).toFixed(0)}%`} tone="green" />}
          {playCount > 0 && <Tag label={`播放 ${playCount} 次`} tone="neutral" />}
          {details?.actress && <Tag label={details.actress} tone="rose" />}
          {movie.year && <Tag label={movie.year} tone="green" />}
          {details?.kinds?.slice(0, 2).map((kind) => <Tag key={kind} label={kind} tone="neutral" />)}
          {details?.kinds && details.kinds.length > 2 && <Tag label={`+${details.kinds.length - 2}`} tone="neutral" />}
        </div>

        {error && (
          <div className="border border-[#6d3a32] bg-[#2d1714] px-2 py-1.5 text-xs text-[#ffb0a5]">
            详情加载失败
          </div>
        )}

        <div className="grid grid-cols-3 border border-[#3e392d] bg-[#15130f] text-xs">
          <InfoCell label="大小" value={formatFileSize(movie.size)} />
          <InfoCell label="评分" value={`${details?.elo ?? 1000}`} />
          <InfoCell label="对战" value={matchCount ? `${matchCount} 场` : "未开始"} />
        </div>

        {playbackProgress > 0.02 && (
          <div className="border border-[#3e392d] bg-[#15130f] p-2">
            <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-[#a99f8d]">
              <span>{movie.watched ? "已看过" : "播放进度"}</span>
              <span>{Math.round(playbackProgress * 100)}%</span>
            </div>
            <div className="h-1.5 bg-[#2a261d]">
              <div className="h-full bg-[#4fa58b]" style={{ width: `${Math.min(playbackProgress * 100, 100)}%` }} />
            </div>
          </div>
        )}

        {matchCount > 0 && (
          <div className="border border-[#3e392d] bg-[#15130f] p-2 text-xs text-[#c8bdab]">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#e7bd67]">胜率 {winRate !== undefined ? `${(winRate * 100).toFixed(1)}%` : "--"}</span>
              <span>
                {details?.winCount || 0} 胜 / {details?.drawCount || 0} 平 / {details?.lossCount || 0} 负
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-[#3e392d] pt-2 text-xs text-[#8f846f]">
          <span>{new Date(movie.modifiedAt).toLocaleDateString("zh-CN")}</span>
          <span>{movie.extension.replace(".", "").toUpperCase()}</span>
        </div>
      </div>
    </article>
  );
};

function Tag({ label, tone }: { label: string; tone: "rose" | "green" | "neutral" }) {
  const className =
    tone === "rose"
      ? "border-[#70444c] bg-[#321b22] text-[#ffc0cc]"
      : tone === "green"
      ? "border-[#2f6758] bg-[#132b25] text-[#aee7d3]"
      : "border-[#4a4334] bg-[#15130f] text-[#d9cbb4]";

  return <span className={`border px-2 py-0.5 text-[11px] font-bold ${className}`}>{label}</span>;
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-[#3e392d] px-2 py-2 last:border-r-0">
      <div className="text-[10px] font-bold text-[#8f846f]">{label}</div>
      <div className="mt-0.5 truncate font-black text-[#fff8e7]" title={value}>
        {value}
      </div>
    </div>
  );
}

export default memo(MovieCardLazy);
