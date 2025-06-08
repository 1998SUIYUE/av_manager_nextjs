/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import DirectoryInput from "@/components/DirectoryInput";
import MovieCard from "@/components/MovieCard";
import { formatFileSize } from "@/utils/formatFileSize";
import { errorWithTimestamp } from "@/utils/logger";

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
  coverUrl?: string | null; // 封面图片URL，可选
  displayTitle?: string; // 用于显示给用户的标题，可能与原始title不同
  actress?: string | null; // 女优名字，可选
}

// 定义排序模式的类型
type SortMode = "time" | "size";

const MoviesPage = () => {
  const [movies, setMovies] = useState<MovieData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingStartTime, setLoadingStartTime] = useState<number | null>(null); // 加载开始时间
  const [elapsedLoadingTime, setElapsedLoadingTime] = useState<number>(0); // 已用加载时间
  const [sortMode, setSortMode] = useState<SortMode>("time"); // 默认按时间排序

  const [offset, setOffset] = useState(0); // 当前加载的电影数量偏移量
  const limit = 50; // 每次加载的电影数量
  const [hasMore, setHasMore] = useState(true); // 是否还有更多电影可以加载
  const [totalMovies, setTotalMovies] = useState(0); // 总电影数量

  useEffect(() => {
    if (loadingStartTime) {
      const interval = setInterval(() => {
        setElapsedLoadingTime(Math.floor((Date.now() - loadingStartTime) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [loadingStartTime]);

  const fetchMovies = useCallback(async (currentOffset: number) => {
    setLoading(true);
    if (currentOffset === 0) {
      setLoadingStartTime(Date.now()); // 仅在首次加载时启动计时器
      setElapsedLoadingTime(0); // 重置计时器
    }
    setError(null);
    try {
      const response = await fetch(`/api/movies?offset=${currentOffset}&limit=${limit}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setMovies((prevMovies) => {
        const newMovies = data.movies.filter(
          (newMovie: MovieData) =>
            !prevMovies.some(
              (prevMovie) => prevMovie.absolutePath === newMovie.absolutePath
            )
        );
        return [...prevMovies, ...newMovies];
      });
      setTotalMovies(data.total);
      setHasMore(data.movies.length === limit); // 如果返回的数量小于limit，说明没有更多了
    } catch (e: unknown) {
      errorWithTimestamp("Error fetching movies:", e); // 使用导入的日志工具
      setError(`Failed to load movies: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
      if (currentOffset === 0) {
        setLoadingStartTime(null); // 首次加载完成时停止计时器
      }
    }
  }, [limit]);

  useEffect(() => {
    fetchMovies(0);
  }, [fetchMovies]);

  const handleLoadMore = () => {
    setOffset((prevOffset) => prevOffset + limit);
  };

  useEffect(() => {
    if (offset > 0) {
      fetchMovies(offset);
    }
  }, [offset, fetchMovies]);

  // 处理目录设置的回调函数，当用户在 DirectoryInput 中设置新目录时触发
  const handleSetDirectory = useCallback(async (folderPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/movies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ folderPath }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      // 成功设置目录后，清空现有电影列表，重置offset，并重新加载电影数据
      setMovies([]);
      setOffset(0);
      setHasMore(true);
      await fetchMovies(0); // 重新加载第一页数据
    } catch (e: unknown) {
      errorWithTimestamp("Error setting directory:", e); // 使用导入的日志工具
      setError(`Failed to set directory: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [fetchMovies]);

  // 处理清除目录的回调函数
  const handleClearDirectory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/movies", {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      // 成功清除目录后，清空电影列表，重置offset，并重新加载电影数据 (此时应为空)
      setMovies([]);
      setOffset(0);
      setHasMore(false); // 清空后没有更多数据
      // 可以选择再次调用 fetchMovies(0) 来确认目录已清空，或者直接显示空状态
    } catch (e: unknown) {
      errorWithTimestamp("Error clearing directory:", e); // 使用导入的日志工具
      setError(`Failed to clear directory: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // 根据排序模式对电影进行排序
  const sortedAndFilteredMovies = useMemo(() => {
    const currentMovies = [...movies];

    if (sortMode === "time") {
      currentMovies.sort((a, b) => b.modifiedAt - a.modifiedAt);
    } else if (sortMode === "size") {
      currentMovies.sort((a, b) => b.size - a.size);
    }
    return currentMovies;
  }, [movies, sortMode]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <h1 className="text-4xl font-bold text-center mb-8">电影列表</h1>

      <div className="mb-8 flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 sm:space-x-4">
        <DirectoryInput onSetDirectory={handleSetDirectory} onClearDirectory={handleClearDirectory} />
        
        {/* 排序模式切换 */}
        <div className="flex space-x-2">
          <button
            onClick={() => setSortMode("time")}
            className={`px-4 py-2 rounded-md ${sortMode === "time" ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"}`}
          >
            按时间排序
          </button>
          <button
            onClick={() => setSortMode("size")}
            className={`px-4 py-2 rounded-md ${sortMode === "size" ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"}`}
          >
            按大小排序
          </button>
        </div>
      </div>

      {loading && loadingStartTime && (
        <p className="text-center text-xl mb-4">
          加载中... 已用时: {elapsedLoadingTime} 秒
        </p>
      )}
      {error && <p className="text-center text-red-500 mb-4">错误: {error}</p>}

      <p className="text-center text-lg mb-4">总电影数: {totalMovies}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {sortedAndFilteredMovies.map((movie) => (
          <MovieCard key={movie.absolutePath} movie={movie} formatFileSize={formatFileSize} />
        ))}
      </div>

      {hasMore && !loading && totalMovies > 0 && (
        <div className="flex justify-center mt-8">
          <button
            onClick={handleLoadMore}
            className="px-6 py-3 bg-green-600 rounded-md hover:bg-green-700 text-lg font-semibold"
          >
            加载更多
          </button>
        </div>
      )}

      {!loading && movies.length === 0 && !error && (
        <p className="text-center text-xl mt-8">没有找到电影文件。请设置一个目录。</p>
      )}
    </div>
  );
};

export default MoviesPage;
