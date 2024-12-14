/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect, useMemo } from "react";
import VideoPlayer from "@/components/VideoPlayer";

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

  useEffect(() => {
    async function fetchMovies() {
      try {
        const response = await fetch("/api/movies");
        if (!response.ok) {
          const errorText = await response.text();
          console.error("Error response text:", errorText);
          throw new Error(`Failed to fetch movies: ${response.statusText}`);
        }
        const data = await response.json();
        // console.log("接收到的电影数据:", data);
        setMovies(data);
        setIsLoading(false);
      } catch (err) {
        console.error("Error fetching movies:", err);
        setError(
          err instanceof Error ? err.message : "An unknown error occurred"
        );
        setIsLoading(false);
      }
    }
    fetchMovies();
  }, []);

  // 获取所有女优名字
  const actresses = useMemo(() => {
    const actressSet = new Set(
      movies
        .map((movie) => movie.actress)
        .filter((actress) => actress !== undefined)
    );
    return Array.from(actressSet).sort();
  }, [movies]);

  // 过滤电影列表
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
      result = result.filter((movie) => movie.actress === selectedActress);
    }

    return result;
  }, [movies, searchTerm, selectedActress]);

  // 排序电影列表
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

  // 格式化文件大小的工具函数
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const handleMovieClick = (movie: MovieFile) => {
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

  const handleClearDirectory = async () => {
    try {
      const response = await fetch('/api/movies', {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to clear movie directory');
      }
      window.location.href = "/";
    } catch (error) {
      console.error('Error clearing movie directory:', error);
    }
  };

  if (isLoading) {
    return <div className="text-center py-10">加载中...</div>;
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
          onClick={handleClearDirectory}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors mx-4"
        >
          更改电影目录
        </button>

        <div className="flex items-center space-x-2">
          <SortModeToggle />
          {sortMode === "time" ? <TimeOrderToggle /> : <SizeOrderToggle />}
        </div>
      </div>

      {/* 女优按钮区域 */}
      <div className=" flex flex-wrap gap-2  bg-black pb-4">
        <button
          key="all"
          onClick={() => setSelectedActress(null)}
          className={`px-3 py-1 rounded-md ${
            selectedActress === null
              ? "bg-blue-500 text-white"
              : "bg-gray-200 text-black"
          }`}
        >
          全部
        </button>
        {actresses.map((actress) => (
          <button
            key={actress}
            onClick={() => setSelectedActress(actress)}
            className={`px-3 py-1 rounded-md ${
              selectedActress === actress
                ? "bg-blue-500 text-white"
                : "bg-gray-200 text-black"
            }`}
          >
            {actress}
          </button>
        ))}
      </div>

      {/* 电影列表网格布局 */}
      <div className="grid grid-cols-4 gap-4 ">
        {sortedMovies.map((movie) => (
          <div
            key={movie.filename}
            className="cursor-pointer  bg-white shadow-md rounded-lg overflow-hidden"
            onClick={() => handleMovieClick(movie)}
          >
            {movie.coverUrl ? (
              <div className="aspect-auto w-full">
                <img
                  src={movie.coverUrl}
                  alt={movie.title || movie.filename}
                  onError={(e) => {
                    e.currentTarget.src = "/placeholder-image.svg";
                  }}
                  className="w-full h-auto object-contain"
                />
              </div>
            ) : (
              <img
                src="/placeholder-image.svg"
                alt="无封面"
                className="w-full h-auto object-contain"
              />
            )}
            <div className="p-4">
              <h2 className="text-sm font-semibold truncate mb-2 text-black">
                {movie.displayTitle || movie.filename}
              </h2>
              {movie.actress && (
                <p className="text-xs truncate text-black">{movie.actress}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                {formatFileSize(movie.size)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Video Player Modal */}
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
