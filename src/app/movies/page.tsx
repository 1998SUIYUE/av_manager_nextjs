/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect, useMemo } from "react";
import VideoPlayer from "@/components/VideoPlayer";
import axios from "axios";

interface MovieFile {
  filename: string;
  path: string;
  absolutePath: string;
  size: number;
  sizeInGB: number;
  extension: string;
  title?: string;
  displayTitle?: string;
  year?: string;
  modifiedAt: number;
  code?: string;
  coverUrl?: string;
  localCoverUrl?: string;
  actress?: string;
}

export default function MoviesPage() {
  const [movies, setMovies] = useState<MovieFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [timeOrder, setTimeOrder] = useState<"newest" | "oldest">("newest");
  const [sizeOrder, setSizeOrder] = useState<"largest" | "smallest">("largest");
  const [sortMode, setSortMode] = useState<"time" | "size">("time");
  const [selectedActress, setSelectedActress] = useState<string | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<MovieFile | null>(null);

  const [forwardSeconds, setForwardSeconds] = useState(10);

  // 添加计时器状态
  const [loadingStartTime, setLoadingStartTime] = useState<number | null>(null);
  const [elapsedLoadingTime, setElapsedLoadingTime] = useState<number>(0);

  // 判断是否为手机屏幕
  const [isMobile, setIsMobile] = useState(false);
  // 手机端演员筛选折叠控制
  const [isActressListOpen, setIsActressListOpen] = useState(true);
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (window.innerWidth <= 768) {
      setIsActressListOpen(false);
    } else {
      setIsActressListOpen(true);
    }
  }, [isMobile]);

  const getLocalCoverUrl = async (remoteUrl: string | undefined) => {
    if (!remoteUrl) return "/placeholder-image.svg";
    
    try {
      const response = await axios.get(`/api/image-proxy?url=${encodeURIComponent(remoteUrl)}`);
      return response.data.imageUrl;
    } catch (error) {
      console.error("获取本地图片缓存失败:", error);
      return "/placeholder-image.svg";
    }
  };

  useEffect(() => {
    async function fetchMovies() {
      try {
        setIsLoading(true); // 开始加载时设置加载状态
        setLoadingStartTime(Date.now()); // 记录加载开始时间
        const response = await fetch("/api/movies");
        if (!response.ok) {
          const errorText = await response.text();
          console.error("Error response text:", errorText);
          throw new Error(`Failed to fetch movies: ${response.statusText}`);
        }
        const data = await response.json();
        console.log("接收到的电影数据:", data);
        
        const moviesWithLocalCovers = await Promise.all(
          data.map(async (movie: MovieFile) => {
            if (movie.coverUrl) {
              movie.localCoverUrl = await getLocalCoverUrl(movie.coverUrl);
            } else {
              movie.localCoverUrl = "/placeholder-image.svg";
            }
            return movie;
          })
        );
        
        setMovies(moviesWithLocalCovers);
        setIsLoading(false); // 加载完成
        setLoadingStartTime(null); // 清除开始时间
        setElapsedLoadingTime(0); // 重置计时
      } catch (err) {
        console.error("Error fetching movies:", err);
        setError(
          err instanceof Error ? err.message : "An unknown error occurred"
        );
        setIsLoading(false); // 加载失败
        setLoadingStartTime(null); // 清除开始时间
        setElapsedLoadingTime(0); // 重置计时
      }
    }
    fetchMovies();
  }, []);

  // 计时器效果
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isLoading && loadingStartTime !== null) {
      timer = setInterval(() => {
        setElapsedLoadingTime(Date.now() - loadingStartTime);
      }, 100); // 每100毫秒更新一次
    } else if (!isLoading && timer) {
      clearInterval(timer);
      timer = null;
    }
    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [isLoading, loadingStartTime]);

  const actresses = useMemo(() => {
    const actressCount: Record<string, number> = {};

    movies.forEach((movie) => {
      if (movie.actress) {
        actressCount[movie.actress] = (actressCount[movie.actress] || 0) + 1;
      } else {
        actressCount["unkown"] = (actressCount["unkown"] || 0) + 1;
      }
    });

    return Object.entries(actressCount)
      .map(([actress, count]) => ({ actress, count }))
      .sort((a, b) => b.count - a.count);
  }, [movies]);

  const filteredMovies = useMemo(() => {
    let result = movies;

    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      result = result.filter(
        (movie) =>
          movie.title?.toLowerCase().includes(lowerSearchTerm) ||
          movie.filename.toLowerCase().includes(lowerSearchTerm) ||
          (movie.year && movie.year.includes(lowerSearchTerm))
      );
    }

    if (selectedActress) {
      result = result.filter((movie) =>movie.actress === selectedActress)
    }

    return result;
  }, [movies, searchTerm, selectedActress]);

  const sortedMovies = useMemo(() => {
    return [...filteredMovies].sort((a, b) => {
      if (sortMode === "time") {
        return timeOrder === "newest"
          ? b.modifiedAt - a.modifiedAt
          : a.modifiedAt - b.modifiedAt;
      } else {
        return sizeOrder === "largest" ? b.size - a.size : a.size - b.size;
      }
    });
  }, [filteredMovies, sortMode, timeOrder, sizeOrder]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const handleMovieClick = (movie: MovieFile) => {
    // 失去当前聚焦，防止弹出键盘
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    console.log("选中的电影:", {
      filename: movie.filename,
      path: movie.path,
      size: movie.size,
    });
    setSelectedMovie(movie);
  };

  const closeVideoPlayer = () => {
    console.log("关闭视频播放器");
    setSelectedMovie(null);
  };

  const ForwardSecondsSelector = () => (
    <div className="flex items-center space-x-2 mb-2">
      <span className="text-white">快进秒数:</span>
      {[10, 30, 60, 120].map((seconds) => (
        <button
          key={seconds}
          onClick={() => setForwardSeconds(seconds)}
          className={`px-2 py-1 rounded text-xs ${
            forwardSeconds === seconds
              ? "bg-blue-500 text-white"
              : "bg-gray-200 text-black"
          }`}
        >
          {seconds}秒
        </button>
      ))}
    </div>
  );

  const toggleSortMode = () => {
    setSortMode((prev) => (prev === "time" ? "size" : "time"));
  };

  const toggleTimeOrder = () => {
    setTimeOrder((prev) => (prev === "newest" ? "oldest" : "newest"));
  };

  const toggleSizeOrder = () => {
    setSizeOrder((prev) => (prev === "largest" ? "smallest" : "largest"));
  };

  const SortModeToggle = () => (
    <div className="flex items-center space-x-2 mb-2">
      <span className="text-white mr-2">排序方式:</span>
      <button
        onClick={toggleSortMode}
        className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
      >
        {sortMode === "time" ? "时间" : "大小"}
      </button>
    </div>
  );

  const TimeOrderToggle = () => (
    <div className="flex items-center space-x-2 mb-2">
      <span className="text-white mr-2">时间排序:</span>
      <button
        onClick={toggleTimeOrder}
        className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
      >
        {timeOrder === "newest" ? "最新" : "最旧"}
      </button>
    </div>
  );

  const SizeOrderToggle = () => (
    <div className="flex items-center space-x-2 mb-2">
      <span className="text-white mr-2">大小排序:</span>
      <button
        onClick={toggleSizeOrder}
        className="px-3 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
      >
        {sizeOrder === "largest" ? "最大" : "最小"}
      </button>
    </div>
  );
  const handleRandomMovieClick = () => {
    if (movies.length > 0) {
      const randomIndex = Math.floor(Math.random() * movies.length);
      const randomMovie = movies[randomIndex];
      handleMovieClick(randomMovie);
    }
  };
  const handleClearDirectory = async () => {
    try {
      const response = await fetch("/api/movies", {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to clear movie directory");
      }
      window.location.href = "/";
    } catch (error) {
      console.error("Error clearing movie directory:", error);
    }
  };

  if (isLoading) {
    const seconds = (elapsedLoadingTime / 1000).toFixed(1);
    return <div className="text-center py-10">加载中... {seconds}秒</div>;
  }

  if (error) {
    return <div className="text-center text-red-500 py-10">错误: {error}</div>;
  }

  return (
    <div className="container mx-auto p-0 max-w-[90vw]">
      <div className=" flex items-center justify-between  bg-black my-2">
        <div className="flex items-center space-x-2">
          <div className="flex-grow relative">
            <input
              type="text"
              placeholder="搜索电影..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black pr-10"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                title="清空搜索"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleClearDirectory}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors mx-4"
        >
          更改电影目录
        </button>
        <button
          type="button"
          onClick={handleRandomMovieClick}
          className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors mx-4"
        >
          随机选择电影
        </button>
        <div className="flex items-center space-x-2">
          <SortModeToggle />
          {sortMode === "time" ? <TimeOrderToggle /> : <SizeOrderToggle />}
        </div>
      </div>

      {/* 手机端折叠演员筛选，桌面端始终展开 */}
      {isMobile && (
        <button
          type="button"
          onClick={() => setIsActressListOpen((v) => !v)}
          style={{ width: '100%', background: '#222', color: '#fff', padding: 8, border: 'none', borderRadius: 4, marginBottom: 4, fontSize: 16 }}
        >
          {isActressListOpen ? '折叠演员筛选' : '展开演员筛选'}
        </button>
      )}
      <div
        className="flex flex-wrap gap-2 bg-black pb-4"
        style={isMobile
          ? { display: isActressListOpen ? 'flex' : 'none', flexWrap: 'wrap', gap: 8, background: '#000', paddingBottom: 16 }
          : { display: 'flex', flexWrap: 'wrap', gap: 8, background: '#000', paddingBottom: 16 }}
      >
        <button
          type="button"
          key="all"
          onClick={() => setSelectedActress(null)}
          style={selectedActress === null
            ? { padding: '4px 12px', borderRadius: 6, background: '#3b82f6', color: '#fff', border: 'none' }
            : { padding: '4px 12px', borderRadius: 6, background: '#e5e7eb', color: '#111', border: 'none' }}
        >
          全部
        </button>
        {actresses.map((Record) => (
          <button
            type="button"
            key={Record.actress}
            onClick={() => setSelectedActress(Record.actress)}
            style={selectedActress === Record.actress
              ? { padding: '4px 12px', borderRadius: 6, background: '#3b82f6', color: '#fff', border: 'none' }
              : { padding: '4px 12px', borderRadius: 6, background: '#e5e7eb', color: '#111', border: 'none' }}
          >
            {Record.actress}({Record.count})
          </button>
        ))}
      </div>

      <div
        className="grid grid-cols-4 gap-4"
        id="movie_list"
        style={isMobile
          ? { display: 'grid', gridTemplateColumns: '1fr', gap: '1px', padding: 0, background: '#000' }
          : undefined}
      >
        {sortedMovies.map((movie) => (
          <div
            key={movie.filename}
            className="cursor-pointer"
            onClick={() => handleMovieClick(movie)}
            id={sortedMovies.indexOf(movie).toString()}
            style={isMobile
              ? { background: '#111', borderRadius: 0, overflow: 'hidden', boxShadow: 'none', cursor: 'pointer', margin: 0, padding: 0 }
              : { background: '#2d3748', borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', cursor: 'pointer' }}
          >
            {movie.localCoverUrl ? (
              <div style={isMobile
                ? { width: '100%', background: '#111', aspectRatio: '16/9', margin: 0, padding: 0 }
                : { width: '100%', aspectRatio: '16/9', background: '#111' }}>
                <img
                  src={movie.localCoverUrl}
                  alt={movie.title || movie.filename}
                  onError={(e) => {
                    console.error("图片加载失败:", e.currentTarget.src);
                    e.currentTarget.src = "/placeholder-image.svg";
                  }}
                  style={isMobile
                    ? { width: '100%', height: 'auto', objectFit: 'cover', display: 'block', margin: 0, padding: 0, borderRadius: 0 }
                    : { width: '100%', height: 'auto', objectFit: 'contain', display: 'block' }}
                />
              </div>
            ) : (
              <img
                src="/placeholder-image.svg"
                alt="无封面"
                style={isMobile
                  ? { width: '100%', height: 'auto', objectFit: 'cover', display: 'block', margin: 0, padding: 0, borderRadius: 0 }
                  : { width: '100%', height: 'auto', objectFit: 'contain', display: 'block' }}
              />
            )}
            {!isMobile && (
              <div style={{ padding: 16 }}>
                <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#f3f4f6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {movie.code}{movie.displayTitle || movie.filename}
                </h2>
                {movie.actress && (
                  <p style={{ fontSize: 12, color: '#d1d5db', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{movie.actress}</p>
                )}
                <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{formatFileSize(movie.size)}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedMovie && (
        <div
          className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4"
          onClick={closeVideoPlayer}
        >
          <div
            className="max-w-8xl w-full relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute -top-10 right-0 text-white text-2xl z-60"
              onClick={closeVideoPlayer}
            >
              ✕
            </button>

            <ForwardSecondsSelector />
            <VideoPlayer
              key={selectedMovie.path}
              filepath={selectedMovie.path}
              src={`/api/video/play?path=${encodeURIComponent(
                selectedMovie.path.replace(/\\/g, "/")
              )}`}
              className="w-full h-[90vh] object-contain"
              muted={false}
              filename={selectedMovie.filename}
              forwardSeconds={forwardSeconds}
              onLoadStart={() => {
                console.log("开始加载视频:", {
                  filename: selectedMovie.filename,
                  path: selectedMovie.path,
                });
              }}
              onCanPlay={() => {
                console.log("视频可以播放:", {
                  filename: selectedMovie.filename,
                });
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
