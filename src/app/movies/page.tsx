/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect, useMemo } from "react";
import VideoPlayer from "@/components/VideoPlayer";
import axios from "axios";

// 添加图片加载完成处理
const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
  event.currentTarget.classList.add('loaded');
};

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
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    
    return () => {
      window.removeEventListener('resize', checkIsMobile);
    };
  }, []);

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
    <div className="flex flex-wrap items-center gap-2 mb-2">
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
    <div className="flex items-center mb-2">
      <span className="text-white mr-2 text-sm md:text-base">排序:</span>
      <button
        onClick={toggleSortMode}
        className="px-2 md:px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm md:text-base"
      >
        {sortMode === "time" ? "时间" : "大小"}
      </button>
    </div>
  );

  const TimeOrderToggle = () => (
    <div className="flex items-center mb-2">
      <button
        onClick={toggleTimeOrder}
        className="px-2 md:px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors text-sm md:text-base"
      >
        {timeOrder === "newest" ? "最新" : "最旧"}
      </button>
    </div>
  );

  const SizeOrderToggle = () => (
    <div className="flex items-center mb-2">
      <button
        onClick={toggleSizeOrder}
        className="px-2 md:px-3 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors text-sm md:text-base"
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
    return <div className="text-center py-10 text-lg">加载中...</div>;
  }

  if (error) {
    return <div className="text-center text-red-500 py-10 text-lg">错误: {error}</div>;
  }

  const gridCols = isMobile ? "grid-cols-2" : "grid-cols-4";
  
  return (
    <div className="container mx-auto p-2 md:p-0 max-w-full md:max-w-[90vw]">
      <div className="flex flex-col md:flex-row md:items-center justify-between bg-black mb-4 p-2 rounded-lg">
        <div className="w-full md:w-auto mb-2 md:mb-0">
          <div className="relative">
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

        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={handleClearDirectory}
            className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors text-sm"
          >
            更改目录
          </button>
          <button
            onClick={handleRandomMovieClick}
            className="px-3 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors text-sm"
          >
            随机选择
          </button>
          <div className="flex items-center gap-2">
            <SortModeToggle />
            {sortMode === "time" ? <TimeOrderToggle /> : <SizeOrderToggle />}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 bg-black p-2 rounded-lg mb-4 overflow-x-auto">
        <button
          key="all"
          onClick={() => setSelectedActress(null)}
          className={`px-3 py-1 rounded-md text-sm ${
            selectedActress === null
              ? "bg-blue-500 text-white"
              : "bg-gray-200 text-black"
          }`}
        >
          全部
        </button>
        {actresses.map((Record) => (
          <button
            key={Record.actress}
            onClick={() => setSelectedActress(Record.actress)}
            className={`px-3 py-1 rounded-md text-sm whitespace-nowrap ${
              selectedActress === Record.actress
                ? "bg-blue-500 text-white"
                : "bg-gray-200 text-black"
            }`}
          >
            {Record.actress}({Record.count})
          </button>
        ))}
      </div>

      <div className={`grid ${gridCols} gap-3 md:gap-4`} id="movie_list">
        {sortedMovies.map((movie) => (
          <div
            key={movie.filename}
            className="cursor-pointer bg-gray-800 shadow-md rounded-lg overflow-hidden hover:bg-gray-700 transition-colors"
            onClick={() => handleMovieClick(movie)}
            id={sortedMovies.indexOf(movie).toString()}
          >
            {movie.localCoverUrl ? (
              <div className="aspect-[3/4] w-full">
                <img
                  src={movie.localCoverUrl}
                  alt={movie.title || movie.filename}
                  onError={(e) => {
                    console.error("图片加载失败:", e.currentTarget.src);
                    e.currentTarget.src = "/placeholder-image.svg";
                  }}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onLoad={handleImageLoad}
                />
              </div>
            ) : (
              <div className="aspect-[3/4] w-full flex items-center justify-center bg-gray-700">
                <img
                  src="/placeholder-image.svg"
                  alt="无封面"
                  className="w-1/2 h-auto object-contain opacity-50"
                  onLoad={handleImageLoad}
                />
              </div>
            )}
            <div className="p-3">
              <h2 className="text-sm md:text-base font-semibold truncate mb-1 text-gray-100">
                {movie.code && <span className="text-yellow-400 mr-1">{movie.code}</span>}
                {movie.displayTitle || movie.filename}
              </h2>
              {movie.actress && (
                <p className="text-xs md:text-sm truncate text-gray-300 mb-1">{movie.actress}</p>
              )}
              <p className="text-xs text-gray-400">
                {formatFileSize(movie.size)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {selectedMovie && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-1 md:p-4"
          onClick={closeVideoPlayer}
        >
          <div
            className="w-full h-full relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-2 right-2 text-white text-xl z-60 bg-red-600 w-8 h-8 rounded-full flex items-center justify-center"
              onClick={closeVideoPlayer}
            >
              ✕
            </button>

            <div className="mt-10">
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
        </div>
      )}
    </div>
  );
}
