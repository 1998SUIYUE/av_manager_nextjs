/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef, useTransition } from "react";
import MovieCardLazy from "@/components/MovieCardLazy";
import { devWithTimestamp } from "@/utils/logger";
import VideoPlayer from "@/components/VideoPlayer";
import MovieDuel from "@/components/MovieDuel";

function safeBase64Encode(str: string): string {
  try {
    return btoa(encodeURIComponent(str));
  } catch (error) {
    console.error("Base64 编码失败:", error);
    return encodeURIComponent(str);
  }
}

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

type SortMode = "time" | "size" | "elo";
type SortDirection = "desc" | "asc";
const VISIBLE_BATCH_SIZE = 80;

const sortOptions: Array<{ value: SortMode; label: string; hint: string }> = [
  { value: "time", label: "时间", hint: "按修改时间" },
  { value: "elo", label: "评分", hint: "按 Elo 评分" },
  { value: "size", label: "大小", hint: "按文件大小" },
];

const formatTotalSize = (sizeInGB: number) => {
  if (sizeInGB >= 1024) return `${(sizeInGB / 1024).toFixed(1)} TB`;
  return `${sizeInGB.toFixed(1)} GB`;
};

const MoviesLazyPage = () => {
  const [movies, setMovies] = useState<MovieData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("time");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [totalMovies, setTotalMovies] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [visibleCount, setVisibleCount] = useState(VISIBLE_BATCH_SIZE);
  const [isSortPending, startSortTransition] = useTransition();

  const [actress, setActress] = useState<{ name: string; count: number }[]>([]);
  const [genres, setGenres] = useState<{ name: string; count: number }[]>([]);
  const [selectedActress, setSelectedActress] = useState<string | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [showActressFilters, setShowActressFilters] = useState<boolean>(false);
  const [showGenreFilters, setShowGenreFilters] = useState<boolean>(false);

  const [duplicateMovies, setDuplicateMovies] = useState<Record<string, MovieData[]>>({});
  const [showDuplicates, setShowDuplicates] = useState<boolean>(false);

  const [showVideoPlayer, setShowVideoPlayer] = useState<boolean>(false);
  const [selectedVideoPath, setSelectedVideoPath] = useState<string | null>(null);

  const [isConfirmingPlayerDelete, setIsConfirmingPlayerDelete] = useState(false);
  const [isDeletingFromPlayer, setIsDeletingFromPlayer] = useState(false);
  const playerDeleteConfirmTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const playbackStartRecordedRef = useRef(false);

  const [isDuelMode, setIsDuelMode] = useState<boolean>(false);

  const sortedAndFilteredMovies = useMemo(() => {
    let currentMovies = [...movies];

    if (searchQuery) {
      const lowerCaseQuery = searchQuery.toLowerCase();
      currentMovies = currentMovies.filter(
        (movie) =>
          (movie.title && movie.title.toLowerCase().includes(lowerCaseQuery)) ||
          (movie.displayTitle && movie.displayTitle.toLowerCase().includes(lowerCaseQuery)) ||
          (movie.code && movie.code.toLowerCase().includes(lowerCaseQuery)) ||
          (movie.actress && movie.actress.toLowerCase().includes(lowerCaseQuery)) ||
          (movie.filename && movie.filename.toLowerCase().includes(lowerCaseQuery))
      );
    }

    if (selectedActress) {
      const lowerCaseActress = selectedActress.toLowerCase();
      currentMovies = currentMovies.filter(
        (movie) => movie.actress && movie.actress.toLowerCase().includes(lowerCaseActress)
      );
    }

    if (selectedGenre) {
      currentMovies = currentMovies.filter((movie) => movie.kinds && movie.kinds.includes(selectedGenre));
    }

    const directionFactor = sortDirection === "desc" ? -1 : 1;
    currentMovies.sort((a, b) => {
      let valueA = 0;
      let valueB = 0;

      if (sortMode === "time") {
        valueA = a.modifiedAt ?? 0;
        valueB = b.modifiedAt ?? 0;
      } else if (sortMode === "size") {
        valueA = a.size ?? 0;
        valueB = b.size ?? 0;
      } else if (sortMode === "elo") {
        valueA = a.elo ?? 1000;
        valueB = b.elo ?? 1000;
      }

      return (valueA - valueB) * directionFactor;
    });
    return currentMovies;
  }, [movies, sortMode, sortDirection, searchQuery, selectedActress, selectedGenre]);

  const loaderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleCount < sortedAndFilteredMovies.length) {
          setVisibleCount((count) => count + VISIBLE_BATCH_SIZE);
        }
      },
      { threshold: 1.0 }
    );

    const currentLoader = loaderRef.current;
    if (currentLoader) {
      observer.observe(currentLoader);
    }

    return () => {
      if (currentLoader) {
        observer.unobserve(currentLoader);
      }
    };
  }, [visibleCount, sortedAndFilteredMovies.length]);

  const fetchMovies = useCallback(async (forceRescan = false) => {
    setLoading(true);
    setError(null);
    setLoadedCount(0);
    try {
      const response = await fetch(forceRescan ? "/api/movies-list?rescan=1" : "/api/movies-list");

      if (!response.ok) {
        throw new Error(`请求失败，状态码 ${response.status}`);
      }

      const data = await response.json();
      setMovies(data.movies);
      setTotalMovies(data.total);
    } catch (e: unknown) {
      devWithTimestamp("Error fetching movies list:", e);
      setError(`加载影片失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMovies();
  }, [fetchMovies]);

  const handleCardLoaded = useCallback(() => {
    setLoadedCount((prevCount) => prevCount + 1);
  }, []);

  const handleDetailsLoaded = useCallback((details: MovieData) => {
    setMovies((prevMovies) =>
      prevMovies.map((movie) =>
        movie.absolutePath === details.absolutePath ? { ...movie, ...details } : movie
      )
    );
  }, []);

  useEffect(() => {
    const actressCounts = new Map<string, number>();
    const genreCounts = new Map<string, number>();

    movies.forEach((movie) => {
      if (movie.actress) {
        actressCounts.set(movie.actress, (actressCounts.get(movie.actress) || 0) + 1);
      }
      if (movie.kinds) {
        movie.kinds.forEach((kind) => {
          genreCounts.set(kind, (genreCounts.get(kind) || 0) + 1);
        });
      }
    });

    setActress(
      Array.from(actressCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
    );

    setGenres(
      Array.from(genreCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
    );
  }, [movies]);

  useEffect(() => {
    const moviesByCode = new Map<string, MovieData[]>();

    movies.forEach((movie) => {
      if (movie.code) {
        const existing = moviesByCode.get(movie.code) || [];
        existing.push(movie);
        moviesByCode.set(movie.code, existing);
      }
    });

    const foundDuplicates: Record<string, MovieData[]> = {};
    moviesByCode.forEach((movieGroup, code) => {
      if (movieGroup.length > 1) {
        foundDuplicates[code] = movieGroup;
      }
    });

    setDuplicateMovies(foundDuplicates);
  }, [movies]);

  const handleMovieClick = useCallback((absolutePath: string) => {
    playbackStartRecordedRef.current = false;
    setSelectedVideoPath(absolutePath);
    setShowVideoPlayer(true);
  }, []);

  const handleCloseVideoPlayer = useCallback(() => {
    setSelectedVideoPath(null);
    setShowVideoPlayer(false);
    setIsConfirmingPlayerDelete(false);
    setIsDeletingFromPlayer(false);
    playbackStartRecordedRef.current = false;
    if (playerDeleteConfirmTimeoutRef.current) {
      clearTimeout(playerDeleteConfirmTimeoutRef.current);
    }
  }, []);

  const handleDeleteMovieClick = useCallback(async (filePath: string) => {
    try {
      const response = await fetch("/api/movies/delete-file", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "删除文件失败");
      }

      setMovies((prevMovies) => prevMovies.filter((movie) => movie.absolutePath !== filePath));
      setTotalMovies((prevTotal) => Math.max(0, prevTotal - 1));
    } catch (error) {
      devWithTimestamp(`删除影片时发生错误：${filePath}`, error);
      throw error;
    }
  }, []);

  const handleDeleteFromPlayer = useCallback(async () => {
    if (!selectedVideoPath) return;

    if (playerDeleteConfirmTimeoutRef.current) {
      clearTimeout(playerDeleteConfirmTimeoutRef.current);
    }

    if (isConfirmingPlayerDelete) {
      setIsDeletingFromPlayer(true);
      const filename = movies.find((m) => m.absolutePath === selectedVideoPath)?.filename || selectedVideoPath;
      try {
        await handleDeleteMovieClick(selectedVideoPath);
        setShowVideoPlayer(false);
      } catch (error) {
        alert(`删除影片“${filename}”失败：${error instanceof Error ? error.message : String(error)}`);
        setIsConfirmingPlayerDelete(false);
      } finally {
        setIsDeletingFromPlayer(false);
      }
    } else {
      setIsConfirmingPlayerDelete(true);
      playerDeleteConfirmTimeoutRef.current = setTimeout(() => {
        setIsConfirmingPlayerDelete(false);
      }, 4000);
    }
  }, [selectedVideoPath, isConfirmingPlayerDelete, handleDeleteMovieClick, movies]);

  useEffect(() => {
    return () => {
      if (playerDeleteConfirmTimeoutRef.current) {
        clearTimeout(playerDeleteConfirmTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setVisibleCount(VISIBLE_BATCH_SIZE);
  }, [sortMode, sortDirection, searchQuery, selectedActress, selectedGenre]);

  const visibleMovies = useMemo(
    () => sortedAndFilteredMovies.slice(0, visibleCount),
    [sortedAndFilteredMovies, visibleCount]
  );

  const selectedMovie = useMemo(
    () => movies.find((movie) => movie.absolutePath === selectedVideoPath),
    [movies, selectedVideoPath]
  );

  const resumeSeconds = useMemo(() => {
    if (!selectedMovie || selectedMovie.watched) return undefined;
    const time = selectedMovie.lastPlaybackTime || 0;
    const progress = selectedMovie.playbackProgress || 0;
    return time > 10 && progress < 0.95 ? time : undefined;
  }, [selectedMovie]);

  const totalToLoad = useMemo(() => movies.filter((m) => m.code).length, [movies]);
  const duplicateGroupCount = Object.keys(duplicateMovies).length;
  const totalSize = useMemo(() => movies.reduce((sum, movie) => sum + (movie.sizeInGB || 0), 0), [movies]);
  const ratedCount = useMemo(() => movies.filter((movie) => (movie.matchCount || 0) > 0).length, [movies]);
  const topMovie = useMemo(
    () => [...movies].sort((a, b) => (b.elo ?? 1000) - (a.elo ?? 1000))[0],
    [movies]
  );
  const activeFilterCount = [searchQuery, selectedActress, selectedGenre].filter(Boolean).length;

  const handleRandomPlay = useCallback(() => {
    const pool = sortedAndFilteredMovies.length > 0 ? sortedAndFilteredMovies : movies;
    if (!pool.length) {
      alert("当前没有可随机播放的影片");
      return;
    }
    const randomIndex = Math.floor(Math.random() * pool.length);
    handleMovieClick(pool[randomIndex].absolutePath);
  }, [sortedAndFilteredMovies, movies, handleMovieClick]);

  const recordPlaybackEvent = useCallback(
    async (
      event: "start" | "progress" | "ended",
      progress?: { currentTime: number; duration: number }
    ) => {
      if (!selectedMovie) return;

      try {
        const response = await fetch("/api/playback-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event,
            absolutePath: selectedMovie.absolutePath,
            filename: selectedMovie.filename,
            code: selectedMovie.code,
            currentTime: progress?.currentTime,
            duration: progress?.duration,
          }),
        });

        if (!response.ok) return;

        const data = await response.json();
        const history = data.history;
        if (!history) return;

        setMovies((prevMovies) =>
          prevMovies.map((movie) =>
            movie.absolutePath === selectedMovie.absolutePath
              ? {
                  ...movie,
                  lastPlayedAt: history.lastPlayedAt,
                  playCount: history.playCount,
                  completedCount: history.completedCount,
                  lastPlaybackTime: history.currentTime,
                  playbackDuration: history.duration,
                  playbackProgress: history.progress,
                  watched: history.watched,
                }
              : movie
          )
        );
      } catch (error) {
        devWithTimestamp("[playback-history] Failed to record playback:", error);
      }
    },
    [selectedMovie]
  );

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedActress(null);
    setSelectedGenre(null);
  };

  if (isDuelMode) {
    return <MovieDuel allMovies={movies} onExit={() => setIsDuelMode(false)} />;
  }

  return (
    <main className="min-h-screen bg-[#15130f] text-[#f7f0df]">
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.026)_1px,transparent_1px)] bg-[size:44px_44px]" />
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_18%_8%,rgba(235,185,88,0.18),transparent_30%),radial-gradient(circle_at_92%_18%,rgba(44,140,118,0.16),transparent_32%),linear-gradient(180deg,rgba(21,19,15,0.2),#15130f_82%)]" />

      <div className="relative mx-auto flex w-full max-w-[1680px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="overflow-hidden rounded-[6px] border border-[#3e392d] bg-[#211e18]/88 shadow-2xl shadow-black/35 backdrop-blur">
          <div className="grid gap-0 xl:grid-cols-[1.15fr_0.85fr]">
            <section className="border-b border-[#3e392d] p-5 sm:p-6 xl:border-b-0 xl:border-r">
              <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-end 2xl:justify-between">
                <div>
                  <div className="mb-3 inline-flex items-center gap-2 border border-[#5d5138] bg-[#2f291d] px-3 py-1 text-xs font-semibold text-[#e7bd67]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#e7bd67]" />
                    本地影库控制台
                  </div>
                  <h1 className="text-3xl font-black tracking-normal text-[#fff8e7] sm:text-5xl">
                    我的影片库
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[#b8af9d]">
                    扫描本地文件，补全封面与元数据，快速筛选、播放、删除，并用对战评分整理你的片库偏好。
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:min-w-[520px]">
                  <Metric label="影片" value={totalMovies.toString()} />
                  <Metric label="容量" value={formatTotalSize(totalSize)} />
                  <Metric label="已评分" value={ratedCount.toString()} />
                  <Metric
                    label="重复组"
                    value={duplicateGroupCount.toString()}
                    tone={duplicateGroupCount ? "warn" : "normal"}
                    active={showDuplicates}
                    disabled={duplicateGroupCount === 0}
                    onClick={() => setShowDuplicates((prev) => !prev)}
                  />
                </div>
              </div>

              {showDuplicates && duplicateGroupCount > 0 && (
                <section className="mt-5 border border-[#6b4b2b] bg-[#241b12]/92">
                  <div className="flex items-center justify-between border-b border-[#4a3926] px-4 py-3">
                    <div>
                      <div className="text-sm font-black text-[#f0bd73]">重复影片</div>
                      <div className="text-xs text-[#b8af9d]">{duplicateGroupCount} 组番号重复</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDuplicates(false)}
                      className="border border-[#5d5138] px-3 py-1 text-xs font-bold text-[#e7bd67] hover:border-[#d79b43] hover:bg-[#2a261d]"
                    >
                      收起
                    </button>
                  </div>

                  <div className="grid max-h-[360px] gap-3 overflow-auto p-3 md:grid-cols-2 2xl:grid-cols-3">
                    {Object.entries(duplicateMovies).map(([code, group]) => (
                      <div key={code} className="border border-[#3e392d] bg-[#15130f] p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-black text-[#fff8e7]">{code}</span>
                          <span className="text-xs text-[#d5a85d]">{group.length} 部</span>
                        </div>
                        <div className="space-y-2">
                          {group.map((movie) => (
                            <button
                              key={movie.absolutePath}
                              type="button"
                              onClick={() => handleMovieClick(movie.absolutePath)}
                              title={`点击播放：${movie.filename}`}
                              className="block w-full text-left text-xs leading-5 text-[#c8bdab] hover:text-[#fff8e7]"
                            >
                              <span className="line-clamp-2">{movie.filename}</span>
                              <span className="text-[#8f846f]">{movie.sizeInGB.toFixed(2)} GB</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </section>

            <section className="p-5 sm:p-6">
              <div className="flex h-full flex-col justify-between gap-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.24em] text-[#8f846f]">今日入口</div>
                  <div className="mt-3 text-lg font-bold text-[#fff8e7]">
                    {topMovie?.code ? `当前最高评分：${topMovie.code}` : "等待加载评分数据"}
                  </div>
                  <div className="mt-1 text-sm text-[#b8af9d]">
                    {topMovie?.elo ? `Elo ${topMovie.elo}` : "未评分影片会以 1000 分作为初始值"}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleRandomPlay}
                    className="border border-[#d79b43] bg-[#d79b43] px-4 py-3 text-sm font-black text-[#1e160b] transition hover:bg-[#efb85d] active:translate-y-px"
                  >
                    随机播放
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsDuelMode(true)}
                    className="border border-[#4fa58b] bg-[#214f45] px-4 py-3 text-sm font-black text-[#dffbf0] transition hover:bg-[#2c6759] active:translate-y-px"
                  >
                    影片对战
                  </button>
                </div>
              </div>
            </section>
          </div>
        </header>

        <section className="sticky top-0 z-30 border border-[#3e392d] bg-[#191711]/94 p-3 shadow-xl shadow-black/30 backdrop-blur">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[#8f846f]">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m21 21-4.3-4.3" />
                  <circle cx="11" cy="11" r="8" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="搜索：标题、番号、演员、文件名"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-12 w-full border border-[#4a4334] bg-[#0f0e0b] pl-11 pr-11 text-sm text-[#fff8e7] outline-none transition placeholder:text-[#817867] focus:border-[#d79b43]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[#b8af9d] hover:text-[#fff8e7]"
                  aria-label="清空搜索"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 border border-[#4a4334] bg-[#0f0e0b] xl:w-[360px]">
              {sortOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={sortMode === option.value}
                  title={option.hint}
                  onClick={() => startSortTransition(() => setSortMode(option.value))}
                  className={`px-3 py-2 text-sm font-bold transition ${
                    sortMode === option.value
                      ? "bg-[#e7bd67] text-[#1b160f]"
                      : "text-[#c8bdab] hover:bg-[#2a261d] hover:text-[#fff8e7]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() =>
                startSortTransition(() =>
                  setSortDirection((current) => (current === "desc" ? "asc" : "desc"))
                )
              }
              className="h-12 border border-[#4a4334] px-4 text-sm font-bold text-[#f7f0df] transition hover:border-[#d79b43] hover:bg-[#2a261d]"
              title={
                sortDirection === "desc"
                  ? "当前为倒序：时间新到旧、评分高到低、大小大到小"
                  : "当前为顺序：时间旧到新、评分低到高、大小小到大"
              }
            >
              {sortDirection === "desc" ? "倒序" : "顺序"}
            </button>

            <button
              type="button"
              onClick={() => fetchMovies(true)}
              className="h-12 border border-[#4a4334] px-4 text-sm font-bold text-[#e7bd67] transition hover:border-[#d79b43] hover:bg-[#2a261d]"
            >
              刷新列表
            </button>

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="h-12 border border-[#72403a] px-4 text-sm font-bold text-[#ffb0a5] transition hover:bg-[#3a1d19]"
              >
                清除筛选
              </button>
            )}
          </div>
        </section>

        <div>
          <section className="min-w-0">
            <div className="mb-4 flex flex-col gap-2 border border-[#3e392d] bg-[#211e18]/72 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-black text-[#fff8e7]">
                  {loading ? "正在整理片库" : `当前显示 ${sortedAndFilteredMovies.length} 部影片`}
                </div>
                <div className="mt-1 text-xs text-[#a99f8d]">
                  {isSortPending
                    ? "正在切换排序..."
                    : totalToLoad > 0 && loadedCount < totalToLoad
                    ? `正在补全详情：${loadedCount} / ${totalToLoad}`
                    : activeFilterCount > 0
                    ? "筛选条件已生效"
                    : "按当前排序展示全部可识别影片"}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                {selectedActress && <ActivePill label={`演员：${selectedActress}`} />}
                {selectedGenre && <ActivePill label={`类型：${selectedGenre}`} />}
                {searchQuery && <ActivePill label={`搜索：${searchQuery}`} />}
              </div>
            </div>

            <div className="mb-4 space-y-4">
              <FilterPanel
                title="演员"
                subtitle={`${actress.length} 位`}
                expanded={showActressFilters}
                onToggle={() => setShowActressFilters((prev) => !prev)}
              >
                <ChipCloud
                  items={actress}
                  selected={selectedActress}
                  onSelect={(name) => {
                    if (selectedActress === name) {
                      setSelectedActress(null);
                      setSearchQuery("");
                    } else {
                      setSelectedActress(name);
                      setSelectedGenre(null);
                      setSearchQuery(name || "");
                    }
                  }}
                />
              </FilterPanel>

              <FilterPanel
                title="类型"
                subtitle={`${genres.length} 类`}
                expanded={showGenreFilters}
                onToggle={() => setShowGenreFilters((prev) => !prev)}
              >
                <ChipCloud
                  items={genres}
                  selected={selectedGenre}
                  onSelect={(name) => {
                    if (selectedGenre === name) {
                      setSelectedGenre(null);
                      setSearchQuery("");
                    } else {
                      setSelectedGenre(name);
                      setSelectedActress(null);
                      setSearchQuery("");
                    }
                  }}
                />
              </FilterPanel>
            </div>

            {loading && (
              <div className="mb-4 border border-[#3e392d] bg-[#211e18] p-5 text-center text-sm text-[#d9cbb4]">
                正在加载影片列表，请稍候...
              </div>
            )}

            {error && (
              <div className="mb-4 border border-[#7b3731] bg-[#321916] p-5 text-center text-sm text-[#ffb0a5]">
                错误：{error}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {visibleMovies.map((movie) => (
                <MovieCardLazy
                  key={movie.absolutePath}
                  movie={movie}
                  onMovieClick={handleMovieClick}
                  onLoaded={handleCardLoaded}
                  onDetailsLoaded={handleDetailsLoaded}
                  onDelete={handleDeleteMovieClick}
                />
              ))}
            </div>

            {visibleCount < sortedAndFilteredMovies.length && (
              <div ref={loaderRef} className="flex h-20 items-center justify-center">
                <div className="text-sm text-[#a99f8d]">正在加载更多影片...</div>
              </div>
            )}

            {!loading && movies.length === 0 && !error && (
              <div className="mt-8 border border-[#3e392d] bg-[#211e18]/80 p-8 text-center">
                <div className="text-lg font-black text-[#fff8e7]">没有找到影片文件</div>
                <p className="mt-2 text-sm text-[#b8af9d]">请检查目录是否正确，或确认文件格式和大小符合扫描条件。</p>
              </div>
            )}

            {!loading && movies.length > 0 && sortedAndFilteredMovies.length === 0 && !error && (
              <div className="mt-8 border border-[#3e392d] bg-[#211e18]/80 p-8 text-center">
                <div className="text-lg font-black text-[#fff8e7]">没有匹配的影片</div>
                <p className="mt-2 text-sm text-[#b8af9d]">换个关键词，或清除当前筛选条件。</p>
              </div>
            )}
          </section>
        </div>
      </div>

      {showVideoPlayer && selectedVideoPath && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#070604]/94 p-3 backdrop-blur-sm sm:p-5"
          onClick={handleCloseVideoPlayer}
        >
          <div
            className="flex h-full w-full max-w-[1480px] flex-col border border-[#4a4334] bg-black shadow-2xl shadow-black"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#2a261d] bg-[#15130f] px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-[#fff8e7]">
                  {movies.find((m) => m.absolutePath === selectedVideoPath)?.filename || "正在播放"}
                </div>
                <div className="text-xs text-[#8f846f]">点击空白处关闭播放器</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDeleteFromPlayer}
                  disabled={isDeletingFromPlayer}
                  className={`px-4 py-2 text-sm font-black transition ${
                    isDeletingFromPlayer
                      ? "cursor-not-allowed border border-[#4a4334] bg-[#2a261d] text-[#8f846f]"
                      : isConfirmingPlayerDelete
                      ? "border border-[#d15f50] bg-[#9b2e25] text-white hover:bg-[#b93b30]"
                      : "border border-[#72403a] bg-[#2b1714] text-[#ffb0a5] hover:bg-[#3a1d19]"
                  }`}
                >
                  {isDeletingFromPlayer ? "删除中..." : isConfirmingPlayerDelete ? "确认删除" : "删除影片"}
                </button>
                <button
                  type="button"
                  onClick={handleCloseVideoPlayer}
                  className="border border-[#4a4334] px-3 py-2 text-sm font-black text-[#f7f0df] hover:bg-[#2a261d]"
                  aria-label="关闭播放器"
                >
                  关闭
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <VideoPlayer
                src={`/api/video/stream?path=${safeBase64Encode(selectedVideoPath)}`}
                filepath={selectedVideoPath}
                filename={selectedMovie?.filename}
                seekSeconds={resumeSeconds}
                onPlayStart={(progress) => {
                  if (playbackStartRecordedRef.current) return;
                  playbackStartRecordedRef.current = true;
                  recordPlaybackEvent("start", progress);
                }}
                onTimeUpdate={(progress) => recordPlaybackEvent("progress", progress)}
                onEnded={(progress) => recordPlaybackEvent("ended", progress)}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

function Metric({
  label,
  value,
  tone = "normal",
  active = false,
  disabled = false,
  onClick,
}: {
  label: string;
  value: string;
  tone?: "normal" | "warn";
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const className = `border p-3 text-left transition ${
    tone === "warn" ? "border-[#6b4b2b] bg-[#2c2115]" : "border-[#3e392d] bg-[#15130f]"
  } ${active ? "border-[#d79b43] bg-[#3a2a16]" : ""} ${
    onClick && !disabled ? "cursor-pointer hover:border-[#d79b43] hover:bg-[#2a261d]" : ""
  } ${disabled ? "cursor-not-allowed opacity-70" : ""}`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={className}>
        <div className="text-[11px] font-bold text-[#8f846f]">{label}</div>
        <div className="mt-1 truncate text-lg font-black text-[#fff8e7]">{value}</div>
      </button>
    );
  }

  return (
    <div className={className}>
      <div className="text-[11px] font-bold text-[#8f846f]">{label}</div>
      <div className="mt-1 truncate text-lg font-black text-[#fff8e7]">{value}</div>
    </div>
  );
}

function ActivePill({ label }: { label: string }) {
  return <span className="border border-[#5d5138] bg-[#15130f] px-2.5 py-1 text-[#d9cbb4]">{label}</span>;
}

function FilterPanel({
  title,
  subtitle,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-[#3e392d] bg-[#211e18]/86">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span>
          <span className="block text-sm font-black text-[#fff8e7]">{title}</span>
          <span className="text-xs text-[#8f846f]">{subtitle}</span>
        </span>
        <span className="text-sm font-bold text-[#e7bd67]">{expanded ? "收起" : "展开"}</span>
      </button>
      <div className={`border-t border-[#3e392d] p-3 ${expanded ? "max-h-[360px] overflow-auto" : "max-h-[92px] overflow-hidden"}`}>
        {children}
      </div>
    </section>
  );
}

function ChipCloud({
  items,
  selected,
  onSelect,
}: {
  items: { name: string; count: number }[];
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  if (items.length === 0) {
    return <div className="text-sm text-[#8f846f]">暂无可用筛选项</div>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          key={item.name}
          type="button"
          onClick={() => onSelect(item.name)}
          className={`border px-2.5 py-1.5 text-xs font-bold transition ${
            selected === item.name
              ? "border-[#d79b43] bg-[#d79b43] text-[#1b160f]"
              : "border-[#4a4334] bg-[#15130f] text-[#c8bdab] hover:border-[#e7bd67] hover:text-[#fff8e7]"
          }`}
        >
          {item.name}
          <span className="ml-1 opacity-70">{item.count}</span>
        </button>
      ))}
    </div>
  );
}

export default MoviesLazyPage;
