/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useMemo, useCallback, use } from "react";
import MovieCard from "@/components/MovieCard";
import { formatFileSize } from "@/utils/formatFileSize";
import {  devWithTimestamp } from "@/utils/logger";
import VideoPlayer from "@/components/VideoPlayer"; // 导入 VideoPlayer 组件

// 安全的Base64编码函数，支持中文字符
function safeBase64Encode(str: string): string {
  try {
    // 使用encodeURIComponent处理中文字符，然后进行base64编码
    return btoa(encodeURIComponent(str));
  } catch (error) {
    console.error('Base64编码失败:', error);
    // 如果还是失败，使用URL编码作为备选方案
    return encodeURIComponent(str);
  }
}

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
  kinds?:string[]; // 新增：电影类别
  // Elo评分相关字段
  elo?: number; // Elo评分
  matchCount?: number; // 对比次数
  winCount?: number; // 胜利次数
  drawCount?: number; // 平局次数
  lossCount?: number; // 失败次数
  winRate?: number; // 胜率
  lastRated?: number; // 最后评分时间
  recentMatches?: string[]; // 最近对比过的影片ID (避免重复)
}

// 定义排序模式的类型
type SortMode = "time" | "size" | "elo";

const MoviesPage = () => {
  const [movies, setMovies] = useState<MovieData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingStartTime, setLoadingStartTime] = useState<number | null>(null); // 加载开始时间
  const [elapsedLoadingTime, setElapsedLoadingTime] = useState<number>(0); // 已用加载时间
  const [sortMode, setSortMode] = useState<SortMode>("time"); // 默认按时间排序
  const [searchQuery, setSearchQuery] = useState<string>(""); // 新增：搜索关键词状态
  const [actress,setActress] = useState<{ name: string, count: number }[]>([]);
  const [totalMovies, setTotalMovies] = useState(0); // 总电影数量

  // 新增：选中女优的状态
  const [selectedActress, setSelectedActress] = useState<string | null>(null);
  // 新增：电影类别状态
  const [genres, setGenres] = useState<{ name: string, count: number }[]>([]); 
  // 新增：选中类别状态
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);

  // 新增：控制筛选器折叠状态
  const [showActressFilters, setShowActressFilters] = useState<boolean>(false); 
  const [showGenreFilters, setShowGenreFilters] = useState<boolean>(false);

  // 视频播放相关状态
  const [showVideoPlayer, setShowVideoPlayer] = useState<boolean>(false); // 控制视频播放器显示
  const [selectedVideoPath, setSelectedVideoPath] = useState<string | null>(null); // 当前播放视频的路径

  // 对比评分相关状态
  const [showComparison, setShowComparison] = useState<boolean>(false); // 控制对比评分界面显示
  const [comparisonMovieA, setComparisonMovieA] = useState<MovieData | null>(null); // 对比影片A
  const [comparisonMovieB, setComparisonMovieB] = useState<MovieData | null>(null); // 对比影片B
  const [previewA, setPreviewA] = useState<boolean>(false); // 是否预览影片A
  const [previewB, setPreviewB] = useState<boolean>(false); // 是否预览影片B


  useEffect(() => {
    if (loadingStartTime) {
      const interval = setInterval(() => {
        setElapsedLoadingTime(Math.floor((Date.now() - loadingStartTime) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [loadingStartTime]);

  const fetchMovies = useCallback(async () => {
    setLoading(true);
    setLoadingStartTime(Date.now()); // 启动计时器
    setElapsedLoadingTime(0); // 重置计时器
    setError(null);
    
    try {
      // 始终获取所有电影
      const apiUrl = `/api/movies?fetch_all=true`;
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // 直接设置所有电影
      setMovies(data.movies);
      setTotalMovies(data.total);
      
      // 统计女优影片数量
      const actressCounts = new Map<string, number>();
      // 统计电影类别影片数量
      const genreCounts = new Map<string, number>();

      for (const movie of data.movies) {
        if (movie.actress) {
          actressCounts.set(movie.actress, (actressCounts.get(movie.actress) || 0) + 1);
        }
        if (movie.kinds) {
          for (const kind of movie.kinds) {
            genreCounts.set(kind, (genreCounts.get(kind) || 0) + 1);
          }
        }
      }

      // 转换为数组并按数量降序排序
      const sortedActress = Array.from(actressCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
      
      const sortedGenres = Array.from(genreCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      setActress(sortedActress);
      setGenres(sortedGenres);

    } catch (e: unknown) {
      devWithTimestamp("Error fetching movies:", e);
      setError(`Failed to load movies: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
      setLoadingStartTime(null); // 停止计时器
    }
  }, []);

  useEffect(() => {
    // 初始加载
    fetchMovies();
  }, [fetchMovies]);

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


  // 处理电影删除操作
  const handleDeleteMovieClick = useCallback(async (filePath: string, filename?: string) => {
    if (!filePath) {
      alert("无法删除电影: 文件路径未提供。根据您提供的报错信息，这里不需要对该方法进行额外修改。请确保 filepath 参数的传入是正确的。如果问题依然存在，请提供更详细的错误日志或上下文。");
      return;
    }

    if (!confirm(`确定要删除电影 "${filename || filePath}" 吗？此操作不可撤销！`)) {
      return;
    }

    try {
      devWithTimestamp(`[MoviesPage] 尝试删除电影: ${filePath}`);
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

      devWithTimestamp(`[MoviesPage] 电影删除成功: ${filePath}`);
      alert(`电影 "${filename || filePath}" 已成功删除。`);
      setShowVideoPlayer(false); // 关闭视频播放器
      
      // 立即从当前列表中移除已删除的电影，提供更好的用户体验
      setMovies(prevMovies => prevMovies.filter(movie => movie.absolutePath !== filePath));
      setTotalMovies(prevTotal => Math.max(0, prevTotal - 1)); // 减少总数
      
      // 可选：如果当前页面电影数量太少，可以尝试加载更多
      // 这里我们简化处理，只是移除已删除的项目
    } catch (error) {
      devWithTimestamp(`[MoviesPage] 删除电影时发生错误: ${filePath}`, error);
      alert(error instanceof Error ? error.message : "删除电影时发生错误");
    }
  }, [fetchMovies]);

  // 开始对比评分
  const startComparison = useCallback(async () => {
    if (movies.length < 2) return;
    
    // 直接使用当前已加载的所有影片
    const availableMovies = movies.filter(movie => movie.code);
    if (availableMovies.length < 2) {
      alert("需要至少2部有番号的影片才能进行对比评分");
      return;
    }

    // 统计评分情况
    const ratedMoviesCount = availableMovies.filter(movie => movie.matchCount && movie.matchCount > 0).length;
    const totalMoviesCount = availableMovies.length;
    const ratedPercentage = totalMoviesCount > 0 ? (ratedMoviesCount / totalMoviesCount) * 100 : 0;
    
    devWithTimestamp(`[startComparison] 当前评分统计: ${ratedMoviesCount}/${totalMoviesCount} 部影片已评分 (${ratedPercentage.toFixed(1)}%)`);
    
    // 智能选择算法
    let selectedMovieA: MovieData;
    let selectedMovieB: MovieData;
    
    // 1. 首先尝试选择一部未评分的影片作为A
    const unratedMovies = availableMovies.filter(movie => !movie.matchCount || movie.matchCount === 0);
    
    if (unratedMovies.length > 0) {
      // 如果有未评分的影片，优先选择一部作为A
      selectedMovieA = unratedMovies[Math.floor(Math.random() * unratedMovies.length)];
      devWithTimestamp(`[startComparison] 选择了未评分的影片A: ${selectedMovieA.code}`);
      
      // 对于B，我们有50%的概率选择另一部未评分的影片，50%的概率选择已评分的影片
      const otherUnratedMovies = unratedMovies.filter(m => m.code !== selectedMovieA.code);
      const ratedMovies = availableMovies.filter(movie => movie.matchCount && movie.matchCount > 0);
      
      if (otherUnratedMovies.length > 0 && (ratedMovies.length === 0 || Math.random() < 0.5)) {
        // 选择另一部未评分的影片
        selectedMovieB = otherUnratedMovies[Math.floor(Math.random() * otherUnratedMovies.length)];
        devWithTimestamp(`[startComparison] 选择了未评分的影片B: ${selectedMovieB.code}`);
      } else if (ratedMovies.length > 0) {
        // 选择一部已评分的影片
        selectedMovieB = ratedMovies[Math.floor(Math.random() * ratedMovies.length)];
        devWithTimestamp(`[startComparison] 选择了已评分的影片B: ${selectedMovieB.code} (已进行${selectedMovieB.matchCount}次评分)`);
      } else {
        // 如果没有其他未评分的影片，随机选择一部不同的影片
        do {
          selectedMovieB = availableMovies[Math.floor(Math.random() * availableMovies.length)];
        } while (selectedMovieB.code === selectedMovieA.code);
        devWithTimestamp(`[startComparison] 随机选择了影片B: ${selectedMovieB.code}`);
      }
    } else {
      // 2. 如果所有影片都已评分，则选择评分次数最少的影片作为A的候选
      availableMovies.sort((a, b) => (a.matchCount || 0) - (b.matchCount || 0));
      
      // 从评分次数最少的20%影片中随机选择
      const leastRatedCount = Math.max(1, Math.ceil(availableMovies.length * 0.2));
      const leastRatedMovies = availableMovies.slice(0, leastRatedCount);
      
      selectedMovieA = leastRatedMovies[Math.floor(Math.random() * leastRatedMovies.length)];
      devWithTimestamp(`[startComparison] 所有影片都已评分，选择了评分次数较少的影片A: ${selectedMovieA.code} (已进行${selectedMovieA.matchCount}次评分)`);
      
      // 对于B，避免选择最近已经与A对比过的影片
      const recentMatches = selectedMovieA.recentMatches || [];
      const availableForB = availableMovies.filter(m => 
        m.code !== selectedMovieA.code && !recentMatches.includes(m.code!)
      );
      
      if (availableForB.length > 0) {
        selectedMovieB = availableForB[Math.floor(Math.random() * availableForB.length)];
        devWithTimestamp(`[startComparison] 选择了未在最近与A对比过的影片B: ${selectedMovieB.code}`);
      } else {
        // 如果所有影片都与A对比过，随机选择一部不同的影片
        do {
          selectedMovieB = availableMovies[Math.floor(Math.random() * availableMovies.length)];
        } while (selectedMovieB.code === selectedMovieA.code);
        devWithTimestamp(`[startComparison] 随机选择了影片B: ${selectedMovieB.code}`);
      }
    }
    
    setComparisonMovieA(selectedMovieA);
    setComparisonMovieB(selectedMovieB);
    setShowComparison(true);
    // 重置预览状态
    setPreviewA(false);
    setPreviewB(false);
    
    // 显示评分进度
    const remainingUnrated = unratedMovies.length;
    if (remainingUnrated > 0) {
      devWithTimestamp(`[startComparison] 评分进度: 还有 ${remainingUnrated} 部影片未评分`);
    } else {
      devWithTimestamp(`[startComparison] 评分进度: 所有影片都已至少评分一次`);
    }
  }, [movies, totalMovies]);

  // 处理对比结果
  const handleComparisonResult = useCallback(async (result: 'A_WINS' | 'B_WINS' | 'DRAW') => {
    if (!comparisonMovieA || !comparisonMovieB) return;
    
    try {
      const response = await fetch('/api/movies/rating', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          movieACode: comparisonMovieA.code,
          movieBCode: comparisonMovieB.code,
          result: result
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // 直接更新本地电影数据，而不是重新加载
        setMovies(prevMovies => {
          return prevMovies.map(movie => {
            if (movie.code === comparisonMovieA.code) {
              // 更新影片A的评分数据
              const newElo = data.movieA.newElo;
              const newMatchCount = (movie.matchCount || 0) + 1;
              const newWinCount = (movie.winCount || 0) + (result === 'A_WINS' ? 1 : 0);
              const newDrawCount = (movie.drawCount || 0) + (result === 'DRAW' ? 1 : 0);
              const newLossCount = (movie.lossCount || 0) + (result === 'B_WINS' ? 1 : 0);
              const newWinRate = newMatchCount > 0 ? newWinCount / newMatchCount : 0;
              
              return {
                ...movie,
                elo: newElo,
                matchCount: newMatchCount,
                winCount: newWinCount,
                drawCount: newDrawCount,
                lossCount: newLossCount,
                winRate: newWinRate
              };
            } else if (movie.code === comparisonMovieB.code) {
              // 更新影片B的评分数据
              const newElo = data.movieB.newElo;
              const newMatchCount = (movie.matchCount || 0) + 1;
              const newWinCount = (movie.winCount || 0) + (result === 'B_WINS' ? 1 : 0);
              const newDrawCount = (movie.drawCount || 0) + (result === 'DRAW' ? 1 : 0);
              const newLossCount = (movie.lossCount || 0) + (result === 'A_WINS' ? 1 : 0);
              const newWinRate = newMatchCount > 0 ? newWinCount / newMatchCount : 0;
              
              return {
                ...movie,
                elo: newElo,
                matchCount: newMatchCount,
                winCount: newWinCount,
                drawCount: newDrawCount,
                lossCount: newLossCount,
                winRate: newWinRate
              };
            }
            return movie;
          });
        });
        
        // 开始下一轮对比
        startComparison();
      } else {
        alert('评分提交失败，请重试');
      }
    } catch (error) {
      console.error('提交评分时发生错误:', error);
      alert('评分提交失败，请重试');
    }
  }, [comparisonMovieA, comparisonMovieB, startComparison]);

  // 关闭对比界面
  const closeComparison = useCallback(() => {
    setShowComparison(false);
    setComparisonMovieA(null);
    setComparisonMovieB(null);
    setPreviewA(false);
    setPreviewB(false);
  }, []);

  // 切换预览状态
  const togglePreviewA = useCallback(() => {
    setPreviewA(prev => !prev);
  }, []);

  const togglePreviewB = useCallback(() => {
    setPreviewB(prev => !prev);
  }, []);

  // 键盘快捷键支持
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (!showComparison) return;
      
      switch (event.key.toLowerCase()) {
        case 'a':
          handleComparisonResult('A_WINS');
          break;
        case 's':
          handleComparisonResult('DRAW');
          break;
        case 'd':
          handleComparisonResult('B_WINS');
          break;
        case 'q':
          togglePreviewA(); // Q键切换左侧预览
          break;
        case 'e':
          togglePreviewB(); // E键切换右侧预览
          break;
        case 'escape':
          if (previewA || previewB) {
            setPreviewA(false); // 关闭所有预览
            setPreviewB(false);
          } else {
            closeComparison(); // 否则关闭对比界面
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [showComparison, handleComparisonResult, closeComparison, togglePreviewA, togglePreviewB, previewA, previewB]);

  // 获取最新的对比电影数据
  const currentComparisonMovieA = useMemo(() => {
    if (!comparisonMovieA) return null;
    return movies.find(movie => movie.code === comparisonMovieA.code) || comparisonMovieA;
  }, [movies, comparisonMovieA]);

  // 获取最新的对比电影数据
  const currentComparisonMovieB = useMemo(() => {
    if (!comparisonMovieB) return null;
    return movies.find(movie => movie.code === comparisonMovieB.code) || comparisonMovieB;
  }, [movies, comparisonMovieB]);

  // 根据排序模式对电影进行排序
  const sortedAndFilteredMovies = useMemo(() => {
    let currentMovies = [...movies];

    // 1. Apply general search query (from text input)
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

    // 2. Apply actress filter if selected
    if (selectedActress) {
      const lowerCaseActress = selectedActress.toLowerCase();
      currentMovies = currentMovies.filter(movie => 
        movie.actress && movie.actress.toLowerCase().includes(lowerCaseActress)
      );
    }

    // 3. Apply genre filter if selected
    if (selectedGenre) {
      currentMovies = currentMovies.filter(movie => 
        movie.kinds && movie.kinds.includes(selectedGenre)
      );
    }

    if (sortMode === "time") {
      currentMovies.sort((a, b) => b.modifiedAt - a.modifiedAt);
    } else if (sortMode === "size") {
      currentMovies.sort((a, b) => b.size - a.size);
    } else if (sortMode === "elo") {
      currentMovies.sort((a, b) => (b.elo || 1000) - (a.elo || 1000));
    }
    return currentMovies;
  }, [movies, sortMode, searchQuery, selectedActress, selectedGenre]); // 添加所有相关依赖项

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <h1 className="text-4xl font-bold text-center mb-8">电影列表</h1>

      <div className="mb-2 flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 sm:space-x-4">
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
        <button
            onClick={() => setSortMode("elo")}
            className={`px-4 py-2 rounded-md ${sortMode === "elo" ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"}`}
        >
            按评分排序
        </button>
        {/* 对比评分按钮 */}
        <button
            onClick={() => startComparison()}
            className="px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-semibold"
            disabled={loading || movies.length < 2}
          >
            🆚 开始评分
          </button>
        </div>
      </div>

      {/* 女优筛选器区域 */}
      <div className={`mb-4 transition-all duration-300 ${showActressFilters ? 'p-4 bg-gray-800 rounded-lg shadow-md' : ''}`}>
        <div className="flex justify-between items-center mb-2"> {/* Header for title and toggle button */} 
          <h3 className="text-xl font-semibold">女优：</h3>
          <button
            onClick={() => setShowActressFilters(prev => !prev)}
            className="px-2 py-1 rounded-md bg-gray-600 hover:bg-gray-500 text-gray-300 text-xs font-semibold"
          >
            {showActressFilters ? '收起' : '展开'}
          </button>
        </div>
        <div className={`flex flex-wrap items-center -mb-2 ${showActressFilters ? '' : 'overflow-hidden max-h-7'}`}> {/* Content area for buttons, with negative margin to offset mb-2 of buttons */} 
          
          {actress && actress.map((actressData, index) => (
            <button
              key={`actress-${index}`}
              className={`px-3 py-1 rounded-md text-sm mr-2 mb-2 
                ${selectedActress === actressData.name ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-200 text-black'}`}
              onClick={() => {
                if (selectedActress === actressData.name) {
                  setSelectedActress(null);
                  setSearchQuery(""); // 清空搜索
                } else {
                  setSelectedActress(actressData.name);
                  setSelectedGenre(null); // 选中女优时取消选中类别
                  setSearchQuery(actressData.name || ""); // 将女优名填入搜索框
                }
              }}
            >
              {actressData.name} ({actressData.count})
            </button>
          ))}
        </div>
      </div>

      {/* 电影类别筛选器区域 */}
      <div className={`mb-4 transition-all duration-300 ${showGenreFilters ? 'p-4 bg-gray-800 rounded-lg shadow-md' : ''}`}>
        <div className="flex justify-between items-center mb-2"> {/* Header for title and toggle button */} 
          <h3 className="text-xl font-semibold">类别：</h3>
          <button
            onClick={() => setShowGenreFilters(prev => !prev)}
            className="px-2 py-1 rounded-md bg-gray-600 hover:bg-gray-500 text-gray-300 text-xs font-semibold"
          >
            {showGenreFilters ? '收起' : '展开'}
          </button>
        </div>
        <div className={`flex flex-wrap items-center -mb-2 ${showGenreFilters ? '' : 'overflow-hidden max-h-7'}`}> {/* Content area for buttons, with negative margin to offset mb-2 of buttons */} 
          
          {genres && genres.map((genreData, index) => (
            <button
              key={`genre-${index}`}
              className={`px-3 py-1 rounded-md text-sm mr-2 mb-2 
                ${selectedGenre === genreData.name ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-200 text-black'}`}
              onClick={() => {
                if (selectedGenre === genreData.name) {
                  setSelectedGenre(null);
                  setSearchQuery(""); // 清空搜索
                } else {
                  setSelectedGenre(genreData.name);
                  setSelectedActress(null); // 选中类别时取消选中女优
                  setSearchQuery(""); // 类别不直接设置搜索框，只影响过滤
                }
              }}
            >
              {genreData.name} ({genreData.count})
            </button>
          ))}
        </div>
      </div>

      {loading && loadingStartTime && (
        <p className="text-center text-xl mb-4">
          加载中... 已用时: {elapsedLoadingTime} 秒
        </p>
      )}
      {error && <p className="text-center text-red-500 mb-4">错误: {error}</p>}

      <div className="text-center mb-6">
        <p className="text-lg mb-2 mt-2">总电影数: {totalMovies}</p>
        {(searchQuery || selectedActress || selectedGenre) && (
          <p className="text-sm text-gray-400">显示 {sortedAndFilteredMovies.length} 部搜索结果</p>
        )}
      </div>


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
              src={`/api/video/stream?path=${safeBase64Encode(selectedVideoPath)}`}
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

      {/* 对比评分弹窗 */}
      {showComparison && currentComparisonMovieA && currentComparisonMovieB && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
            
            {/* 标题栏 */}
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <div className="flex items-center space-x-4">
                <h2 className="text-2xl font-bold">🆚 影片对比评分</h2>
                <div className="text-sm bg-gray-700 px-3 py-1 rounded">
                  <span className="text-gray-300">未评分:</span>
                  <span className="text-red-400 font-bold ml-1">
                    {movies.filter(movie => movie.code && (!movie.matchCount || movie.matchCount === 0)).length}
                  </span>
                  <span className="text-gray-400 mx-1">/</span>
                  <span className="text-blue-400 font-bold">
                    {movies.filter(movie => movie.code).length}
                  </span>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                {(previewA || previewB) && (
                  <span className="text-sm text-gray-400">
                    正在预览: {previewA && previewB ? '双侧' : previewA ? '左侧' : '右侧'}影片
                  </span>
                )}
                <button onClick={closeComparison} className="text-gray-400 hover:text-white text-2xl">✕</button>
              </div>
            </div>
            
            {/* 主要对比区域 */}
            <div className="flex-1 flex overflow-hidden">
              {/* 左侧影片A */}
              <div className="w-1/2 p-4 border-r border-gray-700 flex flex-col overflow-hidden">
                <div className="flex flex-col h-full">

                  
                  {/* 固定大小的预览区域 */}
                  <div className="w-full h-80 flex items-center justify-center bg-gray-900 rounded-lg flex-shrink-0 relative">
                    {previewA ? (
                      <div className="w-full h-full bg-black rounded-lg overflow-hidden">
                        <div className="w-full h-full">
                          <VideoPlayer
                            src={`/api/video/stream?path=${safeBase64Encode(currentComparisonMovieA.absolutePath)}`}
                            filepath={currentComparisonMovieA.absolutePath}
                            filename={currentComparisonMovieA.filename}
                          />
                        </div>
                      </div>
                    ) : (
                      <img
                        src={currentComparisonMovieA.coverUrl || "/placeholder-image.svg"}
                        alt={currentComparisonMovieA.title}
                        className="max-w-full max-h-full object-contain rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={togglePreviewA}
                      />
                    )}
                  </div>
                  

                </div>
              </div>
              
              {/* 右侧影片B */}
              <div className="w-1/2 p-4 flex flex-col overflow-hidden">
                <div className="flex flex-col h-full">

                  
                  {/* 固定大小的预览区域 */}
                  <div className="w-full h-80 flex items-center justify-center bg-gray-900 rounded-lg flex-shrink-0 relative">
                    {previewB ? (
                      <div className="w-full h-full bg-black rounded-lg overflow-hidden">
                        <div className="w-full h-full">
                          <VideoPlayer
                            src={`/api/video/stream?path=${safeBase64Encode(currentComparisonMovieB.absolutePath)}`}
                            filepath={currentComparisonMovieB.absolutePath}
                            filename={currentComparisonMovieB.filename}
                          />
                        </div>
                      </div>
                    ) : (
                      <img
                        src={currentComparisonMovieB.coverUrl || "/placeholder-image.svg"}
                        alt={currentComparisonMovieB.title}
                        className="max-w-full max-h-full object-contain rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={togglePreviewB}
                      />
                    )}
                  </div>
                  

                </div>
              </div>
            </div>
            
            {/* 底部选择按钮 */}
            <div className="p-6 border-t border-gray-700">
              <div className="flex justify-center space-x-6">
                <button
                  onClick={() => handleComparisonResult('A_WINS')}
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-lg font-semibold transition-colors"
                >
                  ← 左侧更好
                  <div className="text-sm opacity-75">按 A 键</div>
                </button>
                
                <button
                  onClick={() => handleComparisonResult('DRAW')}
                  className="px-8 py-3 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-lg font-semibold transition-colors"
                >
                  🤝 难分高下
                  <div className="text-sm opacity-75">按 S 键</div>
                </button>
                
                <button
                  onClick={() => handleComparisonResult('B_WINS')}
                  className="px-8 py-3 bg-green-600 hover:bg-green-700 rounded-lg text-lg font-semibold transition-colors"
                >
                  右侧更好 →
                  <div className="text-sm opacity-75">按 D 键</div>
                </button>
              </div>
              
              <div className="mt-4 text-center text-sm text-gray-400 space-y-1">
                <div>
                  <span className="font-semibold">评分快捷键:</span> A(左侧更好) | S(难分高下) | D(右侧更好)
                </div>
                <div>
                  <span className="font-semibold">预览快捷键:</span> Q(预览左侧) | E(预览右侧) | ESC(关闭预览/退出)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default MoviesPage;
