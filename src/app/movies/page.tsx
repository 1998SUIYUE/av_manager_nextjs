/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import MovieCard from "@/components/MovieCard";
import { formatFileSize } from "@/utils/formatFileSize";
import { errorWithTimestamp, logWithTimestamp } from "@/utils/logger";
import VideoPlayer from "@/components/VideoPlayer"; // 导入 VideoPlayer 组件

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
  const [searchQuery, setSearchQuery] = useState<string>(""); // 新增：搜索关键词状态

  const [offset, setOffset] = useState(0); // 当前加载的电影数量偏移量
  const limit = 50; // 每次加载的电影数量
  const [hasMore, setHasMore] = useState(true); // 是否还有更多电影可以加载
  const [totalMovies, setTotalMovies] = useState(0); // 总电影数量

  const bottomBoundaryRef = useRef<HTMLDivElement>(null); // 用于观察底部边界的引用

  // 视频播放相关状态
  const [showVideoPlayer, setShowVideoPlayer] = useState<boolean>(false); // 控制视频播放器显示
  const [selectedVideoPath, setSelectedVideoPath] = useState<string | null>(null); // 当前播放视频的路径

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
      let apiUrl = `/api/movies`;
      if (searchQuery) {
        // 如果有搜索关键词，获取所有电影
        apiUrl = `/api/movies?fetch_all=true`;
        setMovies([]); // 搜索时清空当前列表，重新加载
        setOffset(0); // 搜索时重置偏移量
      } else {
        // 否则进行分页加载
        apiUrl = `/api/movies?offset=${currentOffset}&limit=${limit}`;
      }

      const response = await fetch(apiUrl);
        if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

      if (searchQuery) {
        // 如果是搜索结果，直接替换电影列表
        setMovies(data.movies);
        setHasMore(false); // 搜索结果不分页，所以没有更多
            } else {
        // 否则追加电影列表
        setMovies((prevMovies) => {
          const newMovies = data.movies.filter(
            (newMovie: MovieData) =>
              !prevMovies.some(
                (prevMovie) => prevMovie.absolutePath === newMovie.absolutePath
              )
          );
          return [...prevMovies, ...newMovies];
        });
        setHasMore(data.movies.length === limit); // 如果返回的数量小于limit，说明没有更多了
      }
      setTotalMovies(data.total);
    } catch (e: unknown) {
      errorWithTimestamp("Error fetching movies:", e); // 使用导入的日志工具
      setError(`Failed to load movies: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
      if (currentOffset === 0) {
        setLoadingStartTime(null); // 首次加载完成时停止计时器
      }
    }
  }, [limit, searchQuery]); // 添加 searchQuery 到依赖项

  useEffect(() => {
    // 初始加载或搜索查询变化时加载第一页
    fetchMovies(0);
  }, [fetchMovies, searchQuery]); // 添加 searchQuery 到依赖项，使其在搜索词变化时重新加载

  // 使用 Intersection Observer 实现无限滚动
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          setOffset((prevOffset) => prevOffset + limit);
        }
      },
      { threshold: 0.5 } // 当目标元素完全可见时触发
    );

    if (bottomBoundaryRef.current) {
      observer.observe(bottomBoundaryRef.current);
    }

    return () => {
      if (bottomBoundaryRef.current) {
        observer.unobserve(bottomBoundaryRef.current);
      }
    };
  }, [hasMore, loading, limit]); // 依赖项：hasMore, loading, limit

  useEffect(() => {
    if (offset > 0) {
      fetchMovies(offset);
    }
  }, [offset, fetchMovies]);

  // 处理电影卡片点击事件
  const handleMovieClick = useCallback((absolutePath: string) => {
    setSelectedVideoPath(absolutePath);
    setShowVideoPlayer(true);
  }, []);

  // 关闭视频播放器
  const handleCloseVideoPlayer = useCallback(() => {
    setSelectedVideoPath(null);
    setShowVideoPlayer(false);
  }, []);

  // 新增：处理刷新操作
  const handleRefresh = useCallback(() => {
    logWithTimestamp("[MoviesPage] 用户手动刷新列表");
    setMovies([]); // 清空当前电影列表
    setOffset(0); // 重置偏移量
    setHasMore(true); // 假设还有更多数据，fetchMovies 会纠正这个
    // fetchMovies(0) 会在 useEffect 中因为 offset 和 movies 变化而被触发，或者我们可以直接调用
    // 为确保立即执行，并且覆盖搜索状态，我们直接调用并清空搜索查询（如果需要）
    // 如果希望刷新保留当前搜索词，则不清空 searchQuery
    // 这里我们假设刷新是全局的，所以清空搜索（如果行为需要不同，可以调整）
    // setSearchQuery(""); // 可选：如果刷新应清除搜索
    fetchMovies(0); 
  }, [fetchMovies]);

  // 处理电影删除操作
  const handleDeleteMovieClick = useCallback(async (filePath: string, filename?: string) => {
    if (!filePath) {
      alert("无法删除电影: 文件路径未提供。");
      return;
    }

    if (!confirm(`确定要删除电影 "${filename || filePath}" 吗？此操作不可撤销！`)) {
      return;
    }

    try {
      logWithTimestamp(`[MoviesPage] 尝试删除电影: ${filePath}`);
      const response = await fetch("/api/movies/delete-file", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ filePath: filePath }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "删除文件失败");
      }

      logWithTimestamp(`[MoviesPage] 电影删除成功: ${filePath}`);
      alert(`电影 "${filename || filePath}" 已成功删除。`);
      setShowVideoPlayer(false); // 关闭视频播放器
      fetchMovies(0); // 重新加载电影列表以反映删除
    } catch (error) {
      errorWithTimestamp(`[MoviesPage] 删除电影时发生错误: ${filePath}`, error);
      alert(error instanceof Error ? error.message : "删除电影时发生错误");
    }
  }, [fetchMovies]);

  // 根据排序模式对电影进行排序
  const sortedAndFilteredMovies = useMemo(() => {
    let currentMovies = [...movies];

    // 搜索过滤
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

    if (sortMode === "time") {
      currentMovies.sort((a, b) => b.modifiedAt - a.modifiedAt);
    } else if (sortMode === "size") {
      currentMovies.sort((a, b) => b.size - a.size);
    }
    return currentMovies;
  }, [movies, sortMode, searchQuery]); // 添加 searchQuery 到依赖项

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <h1 className="text-4xl font-bold text-center mb-8">电影列表</h1>

      <div className="mb-8 flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 sm:space-x-4">
        {/* 搜索输入框 */}
        <div className="relative w-full sm:w-1/2">
            <input
              type="text"
            placeholder="搜索电影 (标题, 番号, 女优, 文件名)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full p-2 pr-10 rounded-md bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {/* 一键清除按钮 */}
          {searchQuery && (
              <button
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-white"
            >
              <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
        </div>

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
        {/* 新增刷新按钮 */}
        <button
            onClick={handleRefresh}
            className="px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white"
            disabled={loading}
          >
            {loading && !searchQuery ? "加载中..." : "刷新列表"}
          </button>
        </div>
      </div>

      {loading && loadingStartTime && !searchQuery && (
        <p className="text-center text-xl mb-4">
          加载中... 已用时: {elapsedLoadingTime} 秒
        </p>
      )}
      {error && <p className="text-center text-red-500 mb-4">错误: {error}</p>}

      <p className="text-center text-lg mb-4">总电影数: {totalMovies}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {sortedAndFilteredMovies.map((movie) => (
          <MovieCard 
            key={movie.absolutePath} 
            movie={movie} 
            formatFileSize={formatFileSize}
            onMovieClick={handleMovieClick} // 传递点击事件处理函数
          />
        ))}
      </div>

      {/* 哨兵元素，用于 Intersection Observer 监测 */}
      {hasMore && (
        <div ref={bottomBoundaryRef} style={{ height: '20px', margin: '20px 0' }}></div>
      )}

      {/* 加载更多提示 (当有更多数据时) */}
      {loading && hasMore && (
        <p className="text-center text-xl mt-4">正在加载更多电影...</p>
      )}

      {!loading && movies.length === 0 && !error && (
        <p className="text-center text-xl mt-8">没有找到电影文件。</p>
      )}

      {/* 视频播放器弹窗 */}
      {showVideoPlayer && selectedVideoPath && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4"
          onClick={handleCloseVideoPlayer} // 点击背景关闭
        >
          <div
            className="relative bg-gray-800 rounded-lg shadow-xl w-full max-w-7xl h-full flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()} // 阻止事件冒泡到背景
          >
            
            <VideoPlayer
              src={`/api/video/stream?path=${btoa(selectedVideoPath)}`}
              filepath={selectedVideoPath} // 传递完整路径用于打开文件位置或删除
              filename={movies.find(m => m.absolutePath === selectedVideoPath)?.filename}
            />
            <button
              onClick={() => handleDeleteMovieClick(selectedVideoPath, movies.find(m => m.absolutePath === selectedVideoPath)?.filename)}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-semibold shadow-lg mt-4 self-end"
              style={{ zIndex: 10 }} // 确保按钮在视频上方
            >
              删除电影
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MoviesPage;
