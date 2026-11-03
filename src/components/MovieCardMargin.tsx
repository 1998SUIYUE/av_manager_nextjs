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

interface MovieCardMarginProps {
  movie: BaseMovieData;
  glass?: boolean; // 背景开启时：半透明表面 + 物理阴影（MARGIN 材质）
  showCover?: boolean; // 封面图展示开关（暂时由页面控制）
  onMovieClick: (absolutePath: string) => void;
  onLoaded: () => void;
  onDetailsLoaded: (details: MovieDetails) => void;
  onDelete: (filePath: string) => Promise<void>;
  onSelectActress?: (name: string) => void;
  onSelectGenre?: (name: string) => void;
}

const MovieCardMargin: React.FC<MovieCardMarginProps> = ({
  movie,
  glass = false,
  showCover = true,
  onMovieClick,
  onLoaded,
  onDetailsLoaded,
  onDelete,
  onSelectActress,
  onSelectGenre,
}) => {
  const hasLoadedDetails = Boolean(
    (movie as MovieDetails).coverUrl &&
      ((movie as MovieDetails).coverUrl?.startsWith("/api/image-serve/") ||
        (movie as MovieDetails).coverUrl?.startsWith("/image-cache/") ||
        (movie as MovieDetails).coverUrl?.startsWith("data:"))
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
      <div className={`overflow-hidden rounded-2xl ${glass ? "hair bg-surface/70 backdrop-blur-xl" : "border border-line bg-surface"}`}>
        {showCover && <div className="aspect-[2/3] w-full animate-pulse bg-chip" />}
        <div className="space-y-3 p-4">
          <div className="h-4 w-3/4 animate-pulse rounded bg-chip" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-chip" />
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
      className={`group relative overflow-hidden rounded-2xl transition duration-300 hover:-translate-y-0.5 hover:border-line-strong ${
        glass
          ? "hair bg-surface/70 shadow-[var(--sh-sm)] backdrop-blur-xl hover:shadow-[var(--sh-lg)]"
          : "border border-line bg-surface"
      }`}
      onClick={handleCardClick}
    >
      <button
        type="button"
        onClick={handleDeleteClick}
        className={`absolute right-2.5 top-2.5 z-20 grid h-9 w-9 place-items-center rounded-full border text-white shadow-lg transition ${
          isConfirmingDelete
            ? "border-danger/50 bg-danger-strong"
            : "border-white/15 bg-black/55 backdrop-blur hover:border-danger/40 hover:text-danger"
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
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/85 text-white">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" />
          <span className="mt-3 text-sm font-bold">删除中...</span>
        </div>
      )}

      {showCover && (
        <div className={`relative flex w-full items-center justify-center overflow-hidden ${glass ? "bg-canvas/50" : "bg-deep"} ${isConfirmingDelete ? "opacity-45" : ""}`}>
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/0 opacity-0 transition duration-300 group-hover:bg-black/35 group-hover:opacity-100">
            <div className="grid h-14 w-14 place-items-center rounded-full border border-white/30 bg-white/12 text-white backdrop-blur">
              <svg className="ml-1 h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>

          <img
            src={details?.coverUrl || "/placeholder-image.svg"}
            alt={title}
            className="h-auto w-full transition duration-500 group-hover:scale-[1.025]"
            onError={handleImageError}
          />
        </div>
      )}

      <div className={`space-y-3.5 p-4 ${isConfirmingDelete ? "opacity-45" : ""}`}>
        <div>
          <h2 className={`line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-5 text-ink ${showCover ? "" : "pr-11"}`} title={title}>
            {title}
          </h2>
          <p className="mt-1.5 truncate font-mono text-[11px] tracking-wide text-faint" title={movie.filename}>
            {movie.code || movie.filename}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {movie.watched && <Tag label="已看过" />}
          {!movie.watched && playbackProgress > 0.02 && <Tag label={`看到 ${(playbackProgress * 100).toFixed(0)}%`} />}
          {playCount > 0 && <Tag label={`播放 ${playCount} 次`} />}
          {details?.actress && <Tag label={details.actress} onClick={onSelectActress} accentable />}
          {movie.year && <Tag label={movie.year} />}
          {details?.kinds?.map((kind) => <Tag key={kind} label={kind} onClick={onSelectGenre} />)}
        </div>

        {error && (
          <div className="rounded-lg border border-danger/25 bg-danger/10 px-2.5 py-1.5 text-xs text-danger">
            详情加载失败
          </div>
        )}

        <div className={`grid grid-cols-3 divide-x divide-line rounded-xl border border-line text-xs ${glass ? "bg-canvas/50" : "bg-deep"}`}>
          <InfoCell label="大小" value={formatFileSize(movie.size)} />
          <InfoCell label="评分" value={`${details?.elo ?? 1000}`} />
          <InfoCell label="对战" value={matchCount ? `${matchCount} 场` : "未开始"} />
        </div>

        {playbackProgress > 0.02 && (
          <div>
            <div className="mb-1.5 flex items-center justify-between font-mono text-[11px] text-muted">
              <span>{movie.watched ? "已看过" : "播放进度"}</span>
              <span>{Math.round(playbackProgress * 100)}%</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-chip">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(playbackProgress * 100, 100)}%` }} />
            </div>
          </div>
        )}

        {matchCount > 0 && (
          <div className={`rounded-xl border border-line p-2.5 font-mono text-[11px] text-muted ${glass ? "bg-canvas/50" : "bg-deep"}`}>
            <div className="flex items-center justify-between">
              <span className="text-accent">胜率 {winRate !== undefined ? `${(winRate * 100).toFixed(1)}%` : "--"}</span>
              <span>
                {details?.winCount || 0} 胜 / {details?.drawCount || 0} 平 / {details?.lossCount || 0} 负
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-line pt-2.5 font-mono text-[11px] text-faint">
          <span>{new Date(movie.modifiedAt).toLocaleDateString("zh-CN")}</span>
          <span>{movie.extension.replace(".", "").toUpperCase()}</span>
        </div>
      </div>
    </article>
  );
};

function Tag({
  label,
  onClick,
  accentable = false,
}: {
  label: string;
  onClick?: (label: string) => void;
  accentable?: boolean;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClick(label);
        }}
        className={`rounded-md border border-line bg-chip px-2 py-0.5 text-left text-[11px] text-ink-2 transition hover:border-accent/50 hover:text-accent ${accentable ? "" : ""}`}
        title={`筛选：${label}`}
      >
        {label}
      </button>
    );
  }

  return (
    <span className="rounded-md border border-line bg-chip px-2 py-0.5 text-[11px] text-ink-2">{label}</span>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">{label}</div>
      <div className="mt-0.5 truncate font-mono font-medium text-ink" title={value}>
        {value}
      </div>
    </div>
  );
}

export default memo(MovieCardMargin);
