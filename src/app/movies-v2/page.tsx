/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef, useTransition } from "react";
import localFont from "next/font/local";
import Link from "next/link";
import MovieCardMargin from "@/components/MovieCardMargin";
import PageBackground from "@/components/PageBackground";
import AppearancePanel from "@/components/AppearancePanel";
import AppSidebar from "@/components/AppSidebar";
import { devWithTimestamp } from "@/utils/logger";
import VideoPlayer from "@/components/VideoPlayer";
import MovieDuel from "@/components/MovieDuel";
import type { MovieData } from "@/lib/movie-types";
import { buildMockMovies } from "@/lib/mockMovies";
import { MARGIN_CSS } from "@/lib/marginStyles";
import {
  DEFAULT_APPEARANCE,
  fetchAppearance,
  saveAppearance,
  type AppearanceSettings,
} from "@/lib/appearance";

// ===== 数据源开关 =====
// true  = 设计稿模式：纯前端 mock 数据（不请求任何接口、不引用任何图片资源）
// false = 接回真实片库：走 /api/movies-list 等原有链路
const USE_MOCK = false;

// 封面图展示开关
const SHOW_COVER = true;

const instrumentSerif = localFont({
  src: "../fonts/InstrumentSerif.woff2",
  variable: "--font-instrument-serif",
  weight: "400",
  display: "swap",
});

function safeBase64Encode(str: string): string {
  try {
    return btoa(encodeURIComponent(str));
  } catch (error) {
    console.error("Base64 编码失败:", error);
    return encodeURIComponent(str);
  }
}


type SortMode = "time" | "size" | "elo";
type SortDirection = "desc" | "asc";
const VISIBLE_BATCH_SIZE = 80;

const sortOptions: Array<{ value: SortMode; label: string }> = [
  { value: "time", label: "时间" },
  { value: "elo", label: "评分" },
  { value: "size", label: "大小" },
];

const formatTotalSize = (sizeInGB: number) => {
  if (sizeInGB >= 1024) return `${(sizeInGB / 1024).toFixed(1)} TB`;
  return `${sizeInGB.toFixed(1)} GB`;
};

const formatLastPlayed = (timestamp?: number) => {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const MoviesV2Page = () => {
  const [movies, setMovies] = useState<MovieData[]>(USE_MOCK ? buildMockMovies() : []);
  const [loading, setLoading] = useState<boolean>(!USE_MOCK);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("time");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [totalMovies, setTotalMovies] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [visibleCount, setVisibleCount] = useState(VISIBLE_BATCH_SIZE);
  const [isSortPending, startSortTransition] = useTransition();

  // ===== 外观设置（背景 / 每行列数）=====
  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE);
  const [showAppearance, setShowAppearance] = useState<boolean>(false);
  const [showFilterPopover, setShowFilterPopover] = useState<boolean>(false);
  const appearanceLoadedRef = useRef(false);
  // 顶栏 chip 打开的面板在滚动容器深处，用 ref 平滑滚过去
  const duplicateSectionRef = useRef<HTMLElement>(null);
  const actressSectionRef = useRef<HTMLElement>(null);
  const bgActive = appearance.bgMode !== "off";

  useEffect(() => {
    let alive = true;
    fetchAppearance()
      .then((settings) => {
        if (alive) setAppearance(settings);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) appearanceLoadedRef.current = true;
      });
    return () => {
      alive = false;
    };
  }, []);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(() => {
    if (!appearanceLoadedRef.current) return;
    void saveAppearance(appearance).then((ok) => {
      if (!ok) showToast("外观设置保存失败");
    });
  }, [appearance, showToast]);

  const updateAppearance = useCallback((patch: Partial<AppearanceSettings>) => {
    setAppearance((prev) => ({ ...prev, ...patch }));
  }, []);

  const [actress, setActress] = useState<{ name: string; count: number }[]>([]);
  const [genres, setGenres] = useState<{ name: string; count: number }[]>([]);
  const [selectedActresses, setSelectedActresses] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);

  const [duplicateMovies, setDuplicateMovies] = useState<Record<string, MovieData[]>>({});
  const [showDuplicates, setShowDuplicates] = useState<boolean>(false);

  const [showActressCleanup, setShowActressCleanup] = useState<boolean>(false);
  const [confirmingActressDelete, setConfirmingActressDelete] = useState<string | null>(null);
  const [deletingActress, setDeletingActress] = useState<string | null>(null);
  const actressConfirmTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

    if (selectedActresses.length > 0) {
      currentMovies = currentMovies.filter(
        (movie) => movie.actress && selectedActresses.includes(movie.actress)
      );
    }

    if (selectedGenres.length > 0) {
      const wanted = new Set(selectedGenres);
      currentMovies = currentMovies.filter(
        (movie) => movie.kinds && movie.kinds.some((kind) => wanted.has(kind))
      );
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
  }, [movies, sortMode, sortDirection, searchQuery, selectedActresses, selectedGenres]);

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
    if (USE_MOCK) {
      setMovies(buildMockMovies());
      setTotalMovies(56);
      return;
    }
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
    if (!USE_MOCK) {
      fetchMovies();
    } else {
      setTotalMovies(56);
    }
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

  const actressCleanupGroups = useMemo(() => {
    const groups = new Map<string, { name: string; count: number; sizeGB: number; movies: MovieData[] }>();
    movies.forEach((movie) => {
      if (!movie.actress) return;
      const group = groups.get(movie.actress) || { name: movie.actress, count: 0, sizeGB: 0, movies: [] };
      group.count += 1;
      group.sizeGB += movie.sizeInGB || 0;
      group.movies.push(movie);
      groups.set(movie.actress, group);
    });
    return Array.from(groups.values()).sort((a, b) => b.sizeGB - a.sizeGB);
  }, [movies]);

  const handleMovieClick = useCallback(
    (absolutePath: string) => {
      if (USE_MOCK) {
        showToast("Mock 模式：播放功能需接回真实数据");
        return;
      }
      playbackStartRecordedRef.current = false;
      setSelectedVideoPath(absolutePath);
      setShowVideoPlayer(true);
    },
    [showToast]
  );

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
    if (USE_MOCK) {
      setMovies((prevMovies) => prevMovies.filter((movie) => movie.absolutePath !== filePath));
      setTotalMovies((prevTotal) => Math.max(0, prevTotal - 1));
      return;
    }
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

  const handleDeleteActressMovies = useCallback(
    async (name: string) => {
      const group = actressCleanupGroups.find((item) => item.name === name);
      if (!group || group.movies.length === 0) return;

      if (actressConfirmTimeoutRef.current) {
        clearTimeout(actressConfirmTimeoutRef.current);
      }

      if (USE_MOCK) {
        const paths = new Set(group.movies.map((movie) => movie.absolutePath));
        setMovies((prevMovies) => prevMovies.filter((movie) => !paths.has(movie.absolutePath)));
        setTotalMovies((prevTotal) => Math.max(0, prevTotal - paths.size));
        return;
      }

      setDeletingActress(name);
      setConfirmingActressDelete(null);
      try {
        const response = await fetch("/api/movies/delete-batch", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filePaths: group.movies.map((movie) => movie.absolutePath) }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "批量删除失败");
        }

        const data = await response.json();
        const deletedPaths = new Set<string>(
          data.results
            .filter((item: { status: string }) => item.status === "deleted")
            .map((item: { filePath: string }) => item.filePath)
        );

        setMovies((prevMovies) => prevMovies.filter((movie) => !deletedPaths.has(movie.absolutePath)));
        setTotalMovies((prevTotal) => Math.max(0, prevTotal - deletedPaths.size));

        const failedResults = data.results.filter((item: { status: string }) => item.status !== "deleted");
        if (failedResults.length > 0) {
          const failedNames = failedResults
            .map((item: { filePath: string }) => item.filePath.split(/[\\/]/).pop() || item.filePath)
            .join("\n");
          alert(`已删除 ${deletedPaths.size} 部影片，${failedResults.length} 部删除失败：\n${failedNames}`);
        }
      } catch (error) {
        devWithTimestamp(`批量删除演员影片时发生错误：${name}`, error);
        alert(`删除“${name}”的影片失败：${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setDeletingActress(null);
      }
    },
    [actressCleanupGroups]
  );

  useEffect(() => {
    return () => {
      if (playerDeleteConfirmTimeoutRef.current) {
        clearTimeout(playerDeleteConfirmTimeoutRef.current);
      }
      if (actressConfirmTimeoutRef.current) {
        clearTimeout(actressConfirmTimeoutRef.current);
      }
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setVisibleCount(VISIBLE_BATCH_SIZE);
  }, [sortMode, sortDirection, searchQuery, selectedActresses, selectedGenres]);

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
  const lastPlayedMovie = useMemo(
    () =>
      [...movies]
        .filter((movie) => movie.lastPlayedAt)
        .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))[0],
    [movies]
  );
  const activeFilterCount =
    (searchQuery ? 1 : 0) + selectedActresses.length + selectedGenres.length;
  const detailProgress =
    totalToLoad > 0 && loadedCount < totalToLoad ? `${loadedCount} / ${totalToLoad}` : null;

  const handleRandomPlay = useCallback(() => {
    const pool = sortedAndFilteredMovies.length > 0 ? sortedAndFilteredMovies : movies;
    if (!pool.length) {
      showToast("当前没有可随机播放的影片");
      return;
    }
    const randomIndex = Math.floor(Math.random() * pool.length);
    handleMovieClick(pool[randomIndex].absolutePath);
  }, [sortedAndFilteredMovies, movies, handleMovieClick, showToast]);

  // 更改影片目录：Electron 走原生对话框，浏览器降级为输入框
  const handleChangeMovieDirectory = useCallback(async () => {
    let nextDir: string | null = null;
    if (window.electronAPI?.selectFolder) {
      nextDir = await window.electronAPI.selectFolder();
    } else {
      nextDir = window.prompt("输入新的影片目录路径：");
    }
    if (!nextDir) return;

    const response = await fetch("/api/movies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderPath: nextDir }),
    });
    if (!response.ok) {
      showToast("影片目录更新失败，请重试");
      return;
    }
    showToast("影片目录已更新，正在重新扫描");
    await fetchMovies(true);
  }, [showToast, fetchMovies]);

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
    setSelectedActresses([]);
    setSelectedGenres([]);
  };

  // 多选筛选：同组内"或"、组间"且"；不再联动搜索框
  const toggleActressFilter = useCallback((name: string) => {
    setSelectedActresses((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  }, []);

  const toggleGenreFilter = useCallback((name: string) => {
    setSelectedGenres((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  }, []);

  // 面板：Liquid Glass（影片卡片以外统一玻璃质感）；嵌套内嵌元素用轻白叠加保持层次
  const surfaceCls = "hair glass";
  const deepCls = "bg-white/[0.04]";

  // 每行列数：0=自动（auto-fill 按宽度自适应），4/6=固定列（窄屏自动降级）
  const gridClass =
    appearance.columns === 6
      ? "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6"
      : appearance.columns === 4
      ? "grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4"
      : "grid grid-cols-1 gap-4 sm:[grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]";

  const columnsLabel =
    appearance.columns === 0 ? "AUTO" : `${appearance.columns} 列`;

  if (isDuelMode) {
    return <MovieDuel allMovies={movies} onExit={() => setIsDuelMode(false)} onDelete={handleDeleteMovieClick} />;
  }

  return (
    <main className={`${instrumentSerif.variable} min-h-screen font-sans text-ink antialiased ${bgActive ? "" : "bg-canvas"}`}>
      <style>{MARGIN_CSS}</style>
      <PageBackground
        mode={appearance.bgMode}
        intensity={appearance.bgIntensity}
        imageUrl={appearance.bgImageUrl}
      />

      <AppSidebar
        onOpenDuel={() => setIsDuelMode(true)}
        onOpenAppearance={() => setShowAppearance(true)}
        appearanceActive={showAppearance}
        onChangeDirectory={() => void handleChangeMovieDirectory()}
      />

      <div className="relative ml-14 flex h-screen flex-col">
        {/* ===== 顶栏：窗口拖拽区 + 高频操作 ===== */}
        <div className="app-drag sticky top-0 z-40 flex h-12 shrink-0 items-center gap-3 border-b border-line bg-[#111112]/85 pr-[138px] backdrop-blur-md">
          <span className="app-no-drag pl-4 text-sm font-medium text-ink">影片库</span>
          <span className="app-no-drag truncate font-mono text-[11px] text-faint">
            {totalMovies} 部 · {formatTotalSize(totalSize)} · 已评分 {ratedCount}
          </span>
          {lastPlayedMovie && (
            <button
              type="button"
              onClick={() => handleMovieClick(lastPlayedMovie.absolutePath)}
              title={`上次播放 · 点击播放：${lastPlayedMovie.filename}`}
              className="app-no-drag hidden min-w-0 max-w-[300px] items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-left transition hover:border-accent/50 lg:flex"
            >
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">上次播放</span>
              <span className="min-w-0 truncate text-xs font-medium text-ink">
                {lastPlayedMovie.code || lastPlayedMovie.filename}
              </span>
              <span className="ml-auto hidden shrink-0 font-mono text-[10px] text-muted xl:inline">
                {lastPlayedMovie.watched
                  ? "已看完"
                  : `已看 ${Math.round((lastPlayedMovie.playbackProgress || 0) * 100)}%`}
              </span>
            </button>
          )}
          <div className="min-w-2 flex-1" />
          <div className="app-no-drag flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const next = !showDuplicates;
                setShowDuplicates(next);
                if (next) {
                  requestAnimationFrame(() =>
                    duplicateSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                  );
                }
              }}
              disabled={duplicateGroupCount === 0}
              aria-pressed={showDuplicates}
              title={duplicateGroupCount === 0 ? "没有检测到重复影片" : "查看重复影片分组"}
              className={`rounded-lg border px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${
                showDuplicates
                  ? "border-accent/60 bg-accent/10 text-accent"
                  : "border-line-strong bg-chip text-muted hover:text-ink"
              }`}
            >
              重复 {duplicateGroupCount}
            </button>
            <button
              type="button"
              onClick={() => {
                if (actressConfirmTimeoutRef.current) {
                  clearTimeout(actressConfirmTimeoutRef.current);
                }
                const next = !showActressCleanup;
                setConfirmingActressDelete(null);
                setShowActressCleanup(next);
                if (next) {
                  requestAnimationFrame(() =>
                    actressSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                  );
                }
              }}
              disabled={actressCleanupGroups.length === 0}
              aria-pressed={showActressCleanup}
              className={`rounded-lg border px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${
                showActressCleanup
                  ? "border-accent/60 bg-accent/10 text-accent"
                  : "border-line-strong bg-chip text-muted hover:text-ink"
              }`}
            >
              演员 {actressCleanupGroups.length}
            </button>
            <button
              type="button"
              onClick={handleRandomPlay}
              className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-black transition hover:opacity-90 active:translate-y-px"
            >
              随机播放
            </button>
          </div>
        </div>
        <div className="app-no-drag no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* 重复影片面板 */}
          {showDuplicates && duplicateGroupCount > 0 && (
            <section
              ref={duplicateSectionRef}
              className={`mb-4 mt-4 mx-4 order-2 shrink-0 scroll-mt-[72px] overflow-hidden rounded-2xl sm:mx-6 ${surfaceCls}`}
            >
              <div className="flex items-center justify-between px-5 py-3.5 sm:px-6">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">Duplicates</div>
                  <div className="mt-0.5 text-sm text-ink">{duplicateGroupCount} 组番号重复</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDuplicates(false)}
                  className="rounded-lg border border-line px-3.5 py-1.5 text-xs text-muted transition hover:border-line-strong hover:text-ink"
                >
                  收起
                </button>
              </div>

              <div className="grid max-h-[360px] gap-3 no-scrollbar overflow-auto px-5 pb-5 sm:px-6 md:grid-cols-2 2xl:grid-cols-3">
                {Object.entries(duplicateMovies).map(([code, group]) => (
                  <div key={code} className={`rounded-xl border border-line p-3.5 ${deepCls}`}>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-mono text-sm font-medium text-ink">{code}</span>
                      <span className="font-mono text-xs text-muted">{group.length} 部</span>
                    </div>
                    <div className="space-y-2">
                      {group.map((movie) => (
                        <button
                          key={movie.absolutePath}
                          type="button"
                          onClick={() => handleMovieClick(movie.absolutePath)}
                          title={`点击播放：${movie.filename}`}
                          className="block w-full text-left text-xs leading-5 text-muted transition hover:text-ink"
                        >
                          <span className="line-clamp-2">{movie.filename}</span>
                          <span className="font-mono text-faint">{movie.sizeInGB.toFixed(2)} GB</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 演员清理面板 */}
          {showActressCleanup && actressCleanupGroups.length > 0 && (
            <section
              ref={actressSectionRef}
              className={`mb-4 mt-4 mx-4 order-2 shrink-0 scroll-mt-[72px] overflow-hidden rounded-2xl sm:mx-6 ${surfaceCls}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 sm:px-6">
                <div className="min-w-0">
                  <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">Actress Cleanup</div>
                  <div className="mt-0.5 text-sm text-ink">
                    共 {actressCleanupGroups.length} 位演员 · 删除会连同影片文件、封面与档案一并移除，请谨慎确认
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (actressConfirmTimeoutRef.current) {
                      clearTimeout(actressConfirmTimeoutRef.current);
                    }
                    setConfirmingActressDelete(null);
                    setShowActressCleanup(false);
                  }}
                  className="rounded-lg border border-line px-3.5 py-1.5 text-xs text-muted transition hover:border-line-strong hover:text-ink"
                >
                  收起
                </button>
              </div>

              <div className="grid max-h-[420px] gap-3 no-scrollbar overflow-auto px-5 pb-5 sm:px-6 md:grid-cols-2 2xl:grid-cols-3">
                {actressCleanupGroups.map((group) => {
                  const isConfirming = confirmingActressDelete === group.name;
                  const isDeleting = deletingActress === group.name;
                  const batchBusy = deletingActress !== null;
                  return (
                    <div key={group.name} className={`rounded-xl border border-line p-3.5 ${deepCls}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => toggleActressFilter(group.name)}
                          title={`点击筛选查看：${group.name}`}
                          className="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink transition hover:text-accent"
                        >
                          {group.name}
                        </button>
                        <span className="shrink-0 font-mono text-xs text-muted">
                          {group.count} 部 · {group.sizeGB.toFixed(1)} GB
                        </span>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          disabled={batchBusy}
                          onClick={() => {
                            if (batchBusy) return;
                            if (actressConfirmTimeoutRef.current) {
                              clearTimeout(actressConfirmTimeoutRef.current);
                            }
                            if (isConfirming) {
                              handleDeleteActressMovies(group.name);
                              return;
                            }
                            setConfirmingActressDelete(group.name);
                            actressConfirmTimeoutRef.current = setTimeout(() => {
                              setConfirmingActressDelete(null);
                            }, 4000);
                          }}
                          className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${
                            isDeleting
                              ? "cursor-not-allowed border border-line bg-transparent text-faint"
                              : isConfirming
                              ? "bg-danger-strong text-white hover:opacity-90"
                              : batchBusy
                              ? "cursor-not-allowed border border-line bg-chip text-faint opacity-60"
                              : "border border-danger/35 bg-danger/10 text-danger hover:bg-danger/20"
                          }`}
                        >
                          {isDeleting
                            ? "删除中..."
                            : isConfirming
                            ? `确认删除 ${group.count} 部 / ${group.sizeGB.toFixed(1)} GB`
                            : "删除全部"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        {/* ===== 工具条 ===== */}
        <section className={`sticky top-0 z-30 order-1 mx-4 mt-4 shrink-0 rounded-2xl p-3 sm:mx-6 ${surfaceCls}`}>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-faint">
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m21 21-4.3-4.3" />
                  <circle cx="11" cy="11" r="8" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="搜索：标题、番号、演员、文件名"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`h-11 w-full rounded-lg border border-line pl-10 pr-10 text-sm text-ink outline-none transition placeholder:text-faint focus:border-accent/60 ${deepCls}`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted transition hover:text-ink"
                  aria-label="清空搜索"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              )}
            </div>

            <div className={`grid shrink-0 grid-cols-3 rounded-[10px] border border-line p-1 xl:w-[300px] ${deepCls}`}>
              {sortOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={sortMode === option.value}
                  onClick={() => startSortTransition(() => setSortMode(option.value))}
                  className={`rounded-md px-3 py-1.5 text-sm transition ${
                    sortMode === option.value
                      ? "bg-chip text-ink"
                      : "text-muted hover:text-ink"
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
              className="hair h-11 shrink-0 rounded-lg px-4 text-sm text-ink transition hover:border-line-strong"
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
              onClick={() => setShowFilterPopover(true)}
              aria-pressed={selectedActresses.length + selectedGenres.length > 0}
              className={`hair h-11 shrink-0 rounded-lg px-4 text-sm transition ${
                selectedActresses.length + selectedGenres.length > 0
                  ? "border-accent/60 bg-accent/10 text-accent"
                  : "text-ink hover:border-line-strong"
              }`}
            >
              筛选
              {selectedActresses.length + selectedGenres.length > 0 && (
                <span className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 font-mono text-[10px] text-black">
                  {selectedActresses.length + selectedGenres.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => fetchMovies(true)}
              className="hair h-11 shrink-0 rounded-lg px-4 text-sm text-accent transition hover:border-accent/50"
            >
              刷新列表
            </button>
          </div>

          {/* 激活筛选 pills：可单独移除；无筛选时整行不渲染（零占位） */}
          {activeFilterCount > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
              {searchQuery && <FilterPill label={`搜索：${searchQuery}`} onRemove={() => setSearchQuery("")} />}
              {selectedActresses.map((name) => (
                <FilterPill key={name} label={`演员：${name}`} onRemove={() => toggleActressFilter(name)} />
              ))}
              {selectedGenres.map((name) => (
                <FilterPill key={name} label={`类型：${name}`} onRemove={() => toggleGenreFilter(name)} />
              ))}
              <span className="ml-auto font-mono text-[11px] text-muted">
                显示 {sortedAndFilteredMovies.length} 部 · 每行 {columnsLabel}
              </span>
              <button
                type="button"
                onClick={clearFilters}
                className="shrink-0 font-mono text-[11px] text-danger transition hover:opacity-80"
              >
                清除全部
              </button>
            </div>
          )}
        </section>

        {/* ===== 列表区 ===== */}
        <div className="order-3 shrink-0 px-4 pb-6 pt-4 sm:px-6">
          <section className="min-w-0">
            {/* 加载/补全状态：仅进行中时出现，完成即消失 */}
            {(loading || isSortPending || detailProgress) && (
              <div className="mb-3 font-mono text-[11px] text-faint">
                {loading
                  ? "正在整理片库…"
                  : isSortPending
                  ? "正在切换排序…"
                  : `正在补全详情 ${detailProgress}`}
              </div>
            )}

            {loading && (
              <div className={`mb-4 rounded-2xl p-5 text-center text-sm text-muted ${surfaceCls}`}>
                正在加载影片列表，请稍候...
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-2xl border border-danger/25 bg-danger/10 p-5 text-center text-sm text-danger">
                错误：{error}
              </div>
            )}

            <div className={gridClass}>
              {visibleMovies.map((movie) => (
                <MovieCardMargin
                  key={movie.absolutePath}
                  movie={movie}
                  glass={bgActive}
                  showCover={SHOW_COVER}
                  onMovieClick={handleMovieClick}
                  onLoaded={handleCardLoaded}
                  onDetailsLoaded={handleDetailsLoaded}
                  onDelete={handleDeleteMovieClick}
                  onSelectActress={toggleActressFilter}
                  onSelectGenre={toggleGenreFilter}
                />
              ))}
            </div>

            {visibleCount < sortedAndFilteredMovies.length && (
              <div ref={loaderRef} className="flex h-20 items-center justify-center">
                <div className="font-mono text-xs text-faint">正在加载更多影片...</div>
              </div>
            )}

            {!loading && movies.length === 0 && !error && (
              <div className={`mt-8 rounded-2xl p-8 text-center ${surfaceCls}`}>
                <div className="font-serif text-2xl text-ink">没有找到影片文件</div>
                <p className="mt-2 text-sm text-muted">请检查目录是否正确，或确认文件格式和大小符合扫描条件。</p>
              </div>
            )}

            {!loading && movies.length > 0 && sortedAndFilteredMovies.length === 0 && !error && (
              <div className={`mt-8 rounded-2xl p-8 text-center ${surfaceCls}`}>
                <div className="font-serif text-2xl text-ink">没有匹配的影片</div>
                <p className="mt-2 text-sm text-muted">换个关键词，或清除当前筛选条件。</p>
              </div>
            )}
          </section>
        </div>
        </div>
      </div>

      {/* ===== 全量筛选面板 ===== */}
      {showFilterPopover && (
        <FilterPopover
          actress={actress}
          genres={genres}
          selectedActresses={selectedActresses}
          selectedGenres={selectedGenres}
          onToggleActress={toggleActressFilter}
          onToggleGenre={toggleGenreFilter}
          onClear={clearFilters}
          onClose={() => setShowFilterPopover(false)}
        />
      )}

      {/* ===== 外观设置 ===== */}
      {showAppearance && (
        <AppearancePanel
          settings={appearance}
          onChange={updateAppearance}
          onClose={() => setShowAppearance(false)}
        />
      )}

      {/* ===== Toast ===== */}
      {toast && (
        <div className="hair glass pointer-events-none fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full px-4 py-2 font-mono text-xs text-ink">
          {toast}
        </div>
      )}

      {/* ===== 播放器 ===== */}
      {showVideoPlayer && selectedVideoPath && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-3 backdrop-blur-sm sm:p-5"
          onClick={handleCloseVideoPlayer}
        >
          <div
            className="flex max-h-full w-full max-w-[1480px] flex-col overflow-hidden rounded-2xl border border-line-strong bg-black shadow-2xl shadow-black"
            onClick={(e) => e.stopPropagation()}
          >
            <VideoPlayer
              controlBar
              src={`/api/video/stream?path=${safeBase64Encode(selectedVideoPath)}`}
              filepath={selectedVideoPath}
              seekSeconds={resumeSeconds}
              onPlayStart={(progress) => {
                if (playbackStartRecordedRef.current) return;
                playbackStartRecordedRef.current = true;
                recordPlaybackEvent("start", progress);
              }}
              onTimeUpdate={(progress) => recordPlaybackEvent("progress", progress)}
              onEnded={(progress) => recordPlaybackEvent("ended", progress)}
            >
              {/* 悬浮顶栏：文件名 + 操作按钮，hover 显示，不常驻遮挡画面 */}
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 bg-gradient-to-b from-black/85 via-black/45 to-transparent px-4 pb-8 pt-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <div className="group-hover:pointer-events-auto min-w-0">
                  <div className="truncate text-sm font-medium text-white drop-shadow" title={selectedMovie?.filename}>
                    {selectedMovie?.filename || "正在播放"}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
                    {selectedMovie?.code || "LOCAL FILE"}
                  </div>
                </div>

                <div className="group-hover:pointer-events-auto flex shrink-0 items-center gap-2">
                  {isConfirmingPlayerDelete || isDeletingFromPlayer ? (
                    <button
                      type="button"
                      onClick={handleDeleteFromPlayer}
                      disabled={isDeletingFromPlayer}
                      className={`rounded-lg px-3.5 py-2 text-xs font-medium transition ${
                        isDeletingFromPlayer
                          ? "cursor-not-allowed border border-white/15 bg-transparent text-white/50"
                          : "bg-danger-strong text-white hover:opacity-90"
                      }`}
                    >
                      {isDeletingFromPlayer ? "删除中..." : "确认删除"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleDeleteFromPlayer}
                      className="rounded-lg border border-white/15 bg-black/45 p-2 text-white/85 backdrop-blur transition hover:border-danger/50 hover:text-danger"
                      aria-label="删除影片"
                      title="删除影片"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M6 6l1 15h10l1-15" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleCloseVideoPlayer}
                    className="rounded-lg border border-white/15 bg-black/45 p-2 text-white/85 backdrop-blur transition hover:border-white/40 hover:text-white"
                    aria-label="关闭播放器"
                    title="关闭播放器"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </VideoPlayer>
          </div>
        </div>
      )}
    </main>
  );
};

function Metric({
  label,
  value,
  active = false,
  disabled = false,
  deepCls,
  onClick,
}: {
  label: string;
  value: string;
  active?: boolean;
  disabled?: boolean;
  deepCls: string;
  onClick?: () => void;
}) {
  const className = `rounded-xl border p-3 text-left transition ${
    active ? "border-accent/60 bg-accent/10" : `border-line ${deepCls}`
  } ${onClick && !disabled ? "cursor-pointer hover:border-line-strong" : ""} ${
    disabled ? "cursor-not-allowed opacity-60" : ""
  }`;

  const inner = (
    <>
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">{label}</div>
      <div className="mt-1 truncate font-mono text-lg text-ink">{value}</div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={className}>
        {inner}
      </button>
    );
  }

  return <div className={className}>{inner}</div>;
}

function FilterPopover({
  actress,
  genres,
  selectedActresses,
  selectedGenres,
  onToggleActress,
  onToggleGenre,
  onClear,
  onClose,
}: {
  actress: { name: string; count: number }[];
  genres: { name: string; count: number }[];
  selectedActresses: string[];
  selectedGenres: string[];
  onToggleActress: (name: string) => void;
  onToggleGenre: (name: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filteredActress = q ? actress.filter((item) => item.name.toLowerCase().includes(q)) : actress;
  const filteredGenres = q ? genres.filter((item) => item.name.toLowerCase().includes(q)) : genres;
  const selectedCount = selectedActresses.length + selectedGenres.length;

  return (
    <>
      <button
        type="button"
        aria-label="关闭筛选面板"
        onClick={onClose}
        className="fixed inset-0 z-[55] cursor-default"
      />
      <aside className="hair glass fixed left-1/2 top-1/2 z-[60] flex max-h-[85vh] w-[1100px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl">
        <div className="flex flex-col gap-3 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-serif text-xl tracking-wide text-ink">筛选</h2>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-faint">
              Filter · {actress.length} 位演员 · {genres.length} 类 · 可多选
            </div>
          </div>
          <div className="relative w-full sm:w-64">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-faint">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m21 21-4.3-4.3" />
                <circle cx="11" cy="11" r="8" />
              </svg>
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索演员或类型"
              className="hair h-9 w-full rounded-lg bg-white/[0.05] pl-9 pr-3 text-xs text-ink outline-none transition placeholder:text-faint focus:border-accent/60"
            />
          </div>
        </div>

        {/* 已选筛选常驻区：不随下方列表滚动，随时可见、可单独移除 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
            已选 · {selectedCount}
          </span>
          {selectedActresses.map((name) => (
            <FilterPill key={`actress-${name}`} label={`演员：${name}`} onRemove={() => onToggleActress(name)} />
          ))}
          {selectedGenres.map((name) => (
            <FilterPill key={`genre-${name}`} label={`类型：${name}`} onRemove={() => onToggleGenre(name)} />
          ))}
          {selectedCount === 0 && <span className="text-xs text-faint">尚未选择筛选条件</span>}
          {selectedCount > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="ml-auto font-mono text-[11px] text-danger transition hover:opacity-80"
            >
              清空全部
            </button>
          )}
        </div>

        <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <section>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
              演员 · {filteredActress.length}
            </div>
            {filteredActress.length === 0 ? (
              <div className="text-xs text-faint">没有匹配的演员</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {filteredActress.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => onToggleActress(item.name)}
                    aria-pressed={selectedActresses.includes(item.name)}
                    className={`rounded-md border px-2.5 py-1.5 text-xs transition ${
                      selectedActresses.includes(item.name)
                        ? "border-accent/60 bg-accent/10 text-accent"
                        : "border-line bg-chip text-ink-2 hover:border-accent/40 hover:text-accent"
                    }`}
                  >
                    {item.name}
                    <span className="ml-1 font-mono opacity-60">{item.count}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
              类型 · {filteredGenres.length}
            </div>
            {filteredGenres.length === 0 ? (
              <div className="text-xs text-faint">没有匹配的类型</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {filteredGenres.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => onToggleGenre(item.name)}
                    aria-pressed={selectedGenres.includes(item.name)}
                    className={`rounded-md border px-2.5 py-1.5 text-xs transition ${
                      selectedGenres.includes(item.name)
                        ? "border-accent/60 bg-accent/10 text-accent"
                        : "border-line bg-chip text-ink-2 hover:border-accent/40 hover:text-accent"
                    }`}
                  >
                    {item.name}
                    <span className="ml-1 font-mono opacity-60">{item.count}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-end border-t border-line p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-accent px-6 py-2 text-sm font-medium text-black transition hover:opacity-90 active:translate-y-px"
          >
            完成
          </button>
        </div>
      </aside>
    </>
  );
}

function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 py-1 pl-2.5 pr-1.5 text-xs text-accent">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`移除筛选：${label}`}
        className="grid h-4 w-4 place-items-center rounded transition hover:bg-accent/25"
      >
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </span>
  );
}


export default MoviesV2Page;
