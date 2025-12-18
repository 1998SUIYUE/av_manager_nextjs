/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import MovieCardLazy from "@/components/MovieCardLazy";

import { devWithTimestamp } from "@/utils/logger";

import VideoPlayer from "@/components/VideoPlayer";

// 安全的Base64编码函数
function safeBase64Encode(str: string): string {
  try {
    return btoa(encodeURIComponent(str));
  } catch (error) {
    console.error('Base64编码失败:', error);
    return encodeURIComponent(str);
  }
}

// 扩展电影数据接口以包含所有可能的字段
interface MovieData {
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
}


// 定义排序模式的类型
type SortMode = "time" | "size"; // 初始版本不支持按评分排序

const MoviesLazyPage = () => {
  const [movies, setMovies] = useState<MovieData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("time");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [totalMovies, setTotalMovies] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);

  // 新增：筛选器相关状态
  const [actress, setActress] = useState<{ name: string, count: number }[]>([]);
  const [genres, setGenres] = useState<{ name: string, count: number }[]>([]);
  const [selectedActress, setSelectedActress] = useState<string | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [showActressFilters, setShowActressFilters] = useState<boolean>(false);
  const [showGenreFilters, setShowGenreFilters] = useState<boolean>(false);

  // 新增：用于存储和控制重复电影的显示
  const [duplicateMovies, setDuplicateMovies] = useState<Record<string, MovieData[]>>({});
  const [showDuplicates, setShowDuplicates] = useState<boolean>(false);


  // 视频播放相关状态
  const [showVideoPlayer, setShowVideoPlayer] = useState<boolean>(false);
  const [selectedVideoPath, setSelectedVideoPath] = useState<string | null>(null);

  // 新增：播放器内删除按钮的状态
  const [isConfirmingPlayerDelete, setIsConfirmingPlayerDelete] = useState(false);
  const [isDeletingFromPlayer, setIsDeletingFromPlayer] = useState(false);
  const playerDeleteConfirmTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchMovies = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadedCount(0); // Reset counter on fetch
    try {
      const apiUrl = `/api/movies-list`;
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      setMovies(data.movies);
      setTotalMovies(data.total);

    } catch (e: unknown) {
      devWithTimestamp("Error fetching movies list:", e);
      setError(`Failed to load movies: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMovies();
  }, [fetchMovies]);

  const handleCardLoaded = useCallback(() => {
    setLoadedCount(prevCount => prevCount + 1);
  }, []);

  // 新增：处理子组件加载的详细信息
  const handleDetailsLoaded = useCallback((details: MovieData) => {
    // 修复：不要用详情对象覆盖原始电影对象，否则会丢失 size/modifiedAt 等用于排序的字段
    setMovies(prevMovies =>
      prevMovies.map(movie =>
        movie.absolutePath === details.absolutePath ? { ...movie, ...details } : movie
      )
    );
  }, []);

  // 使用 useMemo 动态计算女优和分类列表
  useEffect(() => {
    const actressCounts = new Map<string, number>();
    const genreCounts = new Map<string, number>();

    movies.forEach(movie => {
      if (movie.actress) {
        actressCounts.set(movie.actress, (actressCounts.get(movie.actress) || 0) + 1);
      }
      if (movie.kinds) {
        movie.kinds.forEach(kind => {
          genreCounts.set(kind, (genreCounts.get(kind) || 0) + 1);
        });
      }
    });

    const sortedActress = Array.from(actressCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    
    const sortedGenres = Array.from(genreCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    setActress(sortedActress);
    setGenres(sortedGenres);
  }, [movies]);

  // 新增：识别重复的电影
  useEffect(() => {
    const moviesByCode = new Map<string, MovieData[]>();
    
    movies.forEach(movie => {
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
    setSelectedVideoPath(absolutePath);
    setShowVideoPlayer(true);
  }, []);

  const handleCloseVideoPlayer = useCallback(() => {
    setSelectedVideoPath(null);
    setShowVideoPlayer(false);
    // 重置播放器删除按钮状态
    setIsConfirmingPlayerDelete(false);
    setIsDeletingFromPlayer(false);
    if (playerDeleteConfirmTimeoutRef.current) {
      clearTimeout(playerDeleteConfirmTimeoutRef.current);
    }
  }, []);

  // --- 核心删除逻辑 (已解耦) ---
  const handleDeleteMovieClick = useCallback(async (filePath: string) => {
    try {
      const response = await fetch("/api/movies/delete-file", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: filePath }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "删除文件失败");
      }
      
      setMovies(prevMovies => prevMovies.filter(movie => movie.absolutePath !== filePath));
      setTotalMovies(prevTotal => Math.max(0, prevTotal - 1));

    } catch (error) {
      devWithTimestamp(`删除电影时发生错误: ${filePath}`, error);
      throw error;
    }
  }, []);

  // --- 播放器内部的删除处理函数 (新版) ---
  const handleDeleteFromPlayer = useCallback(async () => {
    if (!selectedVideoPath) return;

    if (playerDeleteConfirmTimeoutRef.current) {
      clearTimeout(playerDeleteConfirmTimeoutRef.current);
    }

    if (isConfirmingPlayerDelete) {
      setIsDeletingFromPlayer(true);
      const filename = movies.find(m => m.absolutePath === selectedVideoPath)?.filename || selectedVideoPath;
      try {
        await handleDeleteMovieClick(selectedVideoPath);
        setShowVideoPlayer(false); // 成功后关闭
      } catch (error) {
        alert(`删除电影 "${filename}" 失败: ${error instanceof Error ? error.message : String(error)}`);
        // 失败后重置按钮状态
        setIsConfirmingPlayerDelete(false);
      } finally {
        setIsDeletingFromPlayer(false);
      }
    } else {
      setIsConfirmingPlayerDelete(true);
      playerDeleteConfirmTimeoutRef.current = setTimeout(() => {
        setIsConfirmingPlayerDelete(false);
      }, 4000); // 4秒自动取消
    }
  }, [selectedVideoPath, isConfirmingPlayerDelete, handleDeleteMovieClick, movies]);

  // --- Effect for cleaning up timeout ---
  useEffect(() => {
    return () => {
      if (playerDeleteConfirmTimeoutRef.current) {
        clearTimeout(playerDeleteConfirmTimeoutRef.current);
      }
    };
  }, []);

  const sortedAndFilteredMovies = useMemo(() => {
    let currentMovies = [...movies];

    // 1. Apply general search query
    if (searchQuery) {
      const lowerCaseQuery = searchQuery.toLowerCase();
      currentMovies = currentMovies.filter(movie => 
        (movie.title && movie.title.toLowerCase().includes(lowerCaseQuery)) ||
        (movie.displayTitle && movie.displayTitle.toLowerCase().includes(lowerCaseQuery)) ||
        (movie.code && movie.code.toLowerCase().includes(lowerCaseQuery)) ||
        (movie.actress && movie.actress.toLowerCase().includes(lowerCaseQuery)) ||
        (movie.filename && movie.filename.toLowerCase().includes(lowerCaseQuery))
      );
    }

    // 2. Apply actress filter
    if (selectedActress) {
      const lowerCaseActress = selectedActress.toLowerCase();
      currentMovies = currentMovies.filter(movie => 
        movie.actress && movie.actress.toLowerCase().includes(lowerCaseActress)
      );
    }

    // 3. Apply genre filter
    if (selectedGenre) {
      currentMovies = currentMovies.filter(movie => 
        movie.kinds && movie.kinds.includes(selectedGenre)
      );
    }


    if (sortMode === "time") {
      currentMovies.sort((a, b) => (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0));
    } else if (sortMode === "size") {
      currentMovies.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
    }
    return currentMovies;
  }, [movies, sortMode, searchQuery, selectedActress, selectedGenre]);

  const handleRandomPlay = useCallback(() => {
    const pool = sortedAndFilteredMovies.length > 0 ? sortedAndFilteredMovies : movies;
    if (!pool.length) {
      alert('当前没有可供随机播放的影片');
      return;
    }
    const randomIndex = Math.floor(Math.random() * pool.length);
    handleMovieClick(pool[randomIndex].absolutePath);
  }, [sortedAndFilteredMovies, movies, handleMovieClick]);

  const totalToLoad = useMemo(() => movies.filter(m => m.code).length, [movies]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black text-white">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-30 pointer-events-none -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.35),transparent_60%)]" />
        <div className="max-w-7xl mx-auto px-4 pt-10 pb-6">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-cyan-300 to-emerald-300">我的影片库</span>
            <span className="ml-2 text-slate-300 text-lg align-middle">(懒加载)</span>
          </h1>
          <p className="mt-3 text-slate-400 max-w-2xl">智能抓取元数据 · 抽帧自动封面 · 即点即播 · 支持筛选与随机播放</p>

          {/* Toolbar */}
          <div className="mt-6 flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative w-full lg:max-w-xl">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"/></svg>
              </span>
              <input
                type="text"
                placeholder="搜索：标题 / 番号 / 女优 / 文件名"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-3 rounded-xl bg-slate-800/70 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/80 focus:border-blue-500 placeholder-slate-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-300 hover:text-white"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-pressed={sortMode === "time"}
                onClick={() => setSortMode("time")}
                className={`px-4 py-2 rounded-lg border transition cursor-pointer active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500/60 ${sortMode === "time" ? "bg-blue-600 border-blue-500" : "bg-slate-800/70 border-slate-700 hover:bg-slate-700"}`}
              >按时间</button>
              <button
                type="button"
                aria-pressed={sortMode === "size"}
                onClick={() => setSortMode("size")}
                className={`px-4 py-2 rounded-lg border transition cursor-pointer active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500/60 ${sortMode === "size" ? "bg-blue-600 border-blue-500" : "bg-slate-800/70 border-slate-700 hover:bg-slate-700"}`}
              >按大小</button>
              <button
                type="button"
                onClick={handleRandomPlay}
                title="优先从当前搜索/筛选结果中随机，若为空则从全部影片中随机"
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/60 shadow-md shadow-emerald-800/30 cursor-pointer active:scale-95 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
              >随机播放</button>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="px-2.5 py-1 rounded-full bg-slate-800/70 border border-slate-700 text-slate-300">总数：{totalMovies}</span>
            {totalToLoad > 0 && loadedCount < totalToLoad && (
              <span className="px-2.5 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-300">加载详情：{loadedCount} / {totalToLoad}</span>
            )}
            {(searchQuery || selectedActress || selectedGenre) && (
              <span className="px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300">结果：{sortedAndFilteredMovies.length}</span>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 mt-4 space-y-4">
        {/* 女优筛选 */}
        <div className={`transition-all duration-300 ${showActressFilters ? 'p-4 bg-slate-900/80 rounded-xl border border-slate-800 shadow-lg shadow-black/40' : ''}`}>
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-semibold text-slate-200">女优</h3>
            <button
              onClick={() => setShowActressFilters(prev => !prev)}
              className="px-3 py-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700"
            >{showActressFilters ? '收起' : '展开'}</button>
          </div>
          <div className={`flex flex-wrap gap-2 ${showActressFilters ? '' : 'overflow-hidden max-h-8'}`}>
            {actress.map((a) => (
              <button
                key={`actress-${a.name}`}
                className={`px-3 py-1.5 rounded-full text-xs border transition ${selectedActress === a.name ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-800/70 text-slate-200 hover:bg-slate-700 border-slate-700'}`}
                onClick={() => {
                  if (selectedActress === a.name) {
                    setSelectedActress(null);
                    setSearchQuery("");
                  } else {
                    setSelectedActress(a.name);
                    setSelectedGenre(null);
                    setSearchQuery(a.name || "");
                  }
                }}
              >{a.name} <span className="opacity-70">({a.count})</span></button>
            ))}
          </div>
        </div>

        {/* 类别筛选 */}
        <div className={`transition-all duration-300 ${showGenreFilters ? 'p-4 bg-slate-900/80 rounded-xl border border-slate-800 shadow-lg shadow-black/40' : ''}`}>
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-semibold text-slate-200">类别</h3>
            <button
              onClick={() => setShowGenreFilters(prev => !prev)}
              className="px-3 py-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700"
            >{showGenreFilters ? '收起' : '展开'}</button>
          </div>
          <div className={`flex flex-wrap gap-2 ${showGenreFilters ? '' : 'overflow-hidden max-h-8'}`}>
            {genres.map((g) => (
              <button
                key={`genre-${g.name}`}
                className={`px-3 py-1.5 rounded-full text-xs border transition ${selectedGenre === g.name ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-800/70 text-slate-200 hover:bg-slate-700 border-slate-700'}`}
                onClick={() => {
                  if (selectedGenre === g.name) {
                    setSelectedGenre(null);
                    setSearchQuery("");
                  } else {
                    setSelectedGenre(g.name);
                    setSelectedActress(null);
                    setSearchQuery("");
                  }
                }}
              >{g.name} <span className="opacity-70">({g.count})</span></button>
            ))}
          </div>
        </div>

        {/* 重复影片 */}
        {Object.keys(duplicateMovies).length > 0 && (
          <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/30">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-semibold text-amber-300">重复的电影（{Object.keys(duplicateMovies).length} 组）</h3>
              <button
                onClick={() => setShowDuplicates(prev => !prev)}
                className="px-3 py-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700"
              >{showDuplicates ? '收起' : '展开'}</button>
            </div>
            {showDuplicates && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(duplicateMovies).map(([code, movies]) => (
                  <div key={code} className="p-3 bg-slate-900/70 rounded-lg border border-slate-800">
                    <h4 className="font-bold text-base text-blue-300 mb-2">{code}</h4>
                    <ul className="space-y-1 text-sm">
                      {movies.map(movie => (
                        <li key={movie.absolutePath} className="flex items-center justify-between text-slate-300">
                          <span 
                            className="cursor-pointer hover:underline hover:text-white"
                            onClick={() => handleMovieClick(movie.absolutePath)}
                            title={`点击播放: ${movie.filename}`}
                          >{movie.filename}</span>
                          <span className="text-slate-400 ml-2">{(movie.sizeInGB).toFixed(2)} GB</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 mt-6 pb-10">
        {loading && <p className="text-center text-base text-slate-300 mb-4">正在加载电影列表...</p>}
        {error && <p className="text-center text-red-400 mb-4">错误: {error}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {sortedAndFilteredMovies.map((movie) => (
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

        {!loading && movies.length === 0 && !error && (
          <p className="text-center text-lg mt-10 text-slate-400">没有找到电影文件。</p>
        )}

        {showVideoPlayer && selectedVideoPath && (
          <div
            className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={handleCloseVideoPlayer}
          >
            <div
              className="relative bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl w-full max-w-7xl h-full flex flex-col items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <VideoPlayer
                src={`/api/video/stream?path=${safeBase64Encode(selectedVideoPath)}`}
                filepath={selectedVideoPath}
                filename={movies.find(m => m.absolutePath === selectedVideoPath)?.filename}
              />
              <button
                onClick={handleDeleteFromPlayer}
                disabled={isDeletingFromPlayer}
                className={`text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-lg mt-4 self-end transition-all duration-200 ${
                  isDeletingFromPlayer
                    ? 'bg-gray-600 cursor-not-allowed'
                    : isConfirmingPlayerDelete
                    ? 'bg-red-700 hover:bg-red-800'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
                style={{ zIndex: 10 }}
              >
                {isDeletingFromPlayer 
                  ? '删除中...'
                  : isConfirmingPlayerDelete
                  ? '确认删除？'
                  : '删除电影'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MoviesLazyPage;
