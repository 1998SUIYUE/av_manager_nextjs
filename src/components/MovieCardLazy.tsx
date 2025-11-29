/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { formatFileSize } from '@/utils/formatFileSize';
import { devWithTimestamp } from '@/utils/logger';

function safeBase64Encode(str: string): string {
  try {
    return btoa(encodeURIComponent(str));
  } catch {
    // 兼容性降级
    return encodeURIComponent(str);
  }
}

// (Interfaces remain the same)
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

interface MovieCardLazyProps {
  movie: BaseMovieData;
  onMovieClick: (absolutePath: string) => void;
  onLoaded: () => void;
  onDetailsLoaded: (details: MovieDetails) => void;
  onDelete: (filePath: string) => Promise<void>; // 修改为返回Promise
}

const MovieCardLazy: React.FC<MovieCardLazyProps> = ({ movie, onMovieClick, onLoaded, onDetailsLoaded, onDelete }) => {
  const [details, setDetails] = useState<MovieDetails | null>(
    (movie as MovieDetails).coverUrl ? (movie as MovieDetails) : null
  );
  const [isLoading, setIsLoading] = useState(!details);
  const [error, setError] = useState<string | null>(null);
  const fetchInitiatedRef = useRef(!!details);

  // --- 新增删除相关状态 ---
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const confirmTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
      }
    };
  }, []);

  // 标记是否使用了抽帧缩略图
  const [usedFrameThumb, setUsedFrameThumb] = useState(false);

  const handleImageLoad = () => {};
  const handleImageError = async (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.currentTarget;
    // 如果已有占位图，就不再尝试
    if (target.src === window.location.origin + "/placeholder-image.svg") {
      return;
    }

    // 先尝试调用后端缩略图生成接口
    try {
      const b64 = safeBase64Encode(movie.absolutePath);
      const resp = await fetch(`/api/video/thumbnail?path=${b64}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data?.imageUrl) {
          setUsedFrameThumb(true);
          target.src = data.imageUrl;
          return;
        }
      }
    } catch (err) {
      devWithTimestamp('[thumbnail] 抽帧回退失败', err);
    }

    // 最终回退到占位图
    if (target.src !== window.location.origin + "/placeholder-image.svg") {
      target.src = "/placeholder-image.svg";
    }
  };

  // --- 新增删除处理逻辑 ---
  const handleDeleteClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止事件冒泡，防止触发onMovieClick

    if (confirmTimeoutRef.current) {
      clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = null;
    }

    if (isConfirmingDelete) {
      setIsDeleting(true);
      try {
        await onDelete(movie.absolutePath);
        // 成功删除后，组件会因为父组件状态更新而卸载，无需重置状态
      } catch (err) {
        console.error("删除失败:", err);
        alert(`删除文件 ${movie.filename} 失败。`);
        setIsDeleting(false);
        setIsConfirmingDelete(false);
      }
    } else {
      setIsConfirmingDelete(true);
      confirmTimeoutRef.current = setTimeout(() => {
        setIsConfirmingDelete(false);
        confirmTimeoutRef.current = null;
      }, 4000); // 4秒后自动取消确认状态
    }
  }, [isConfirmingDelete, onDelete, movie.absolutePath, movie.filename]);

  const handleCardClick = () => {
    if (isConfirmingDelete) {
      // 如果在确认删除状态，点击卡片主体则取消删除
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
        setError(e instanceof Error ? e.message : 'An unknown error occurred');
        devWithTimestamp(`[movie-details] 详情加载失败 code=${movie.code}:`, e instanceof Error ? e.message : String(e));
      } finally {
        setIsLoading(false);
        onLoaded();
      }
    };

    fetchDetails();
  }, [movie, onLoaded, onDetailsLoaded]);

  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-lg overflow-hidden shadow-lg animate-pulse">
        <div className="bg-gray-700 h-56 w-full"></div>
        <div className="p-3 space-y-3">
          <div className="h-4 bg-gray-700 rounded w-3/4"></div>
          <div className="h-3 bg-gray-700 rounded w-1/2"></div>
        </div>
      </div>
    );
  }


  return (
    <div
      className="group relative rounded-2xl overflow-hidden border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 shadow-xl shadow-black/40 cursor-pointer transition-all duration-300 hover:shadow-2xl hover:shadow-black/50 hover:-translate-y-0.5"
      onClick={handleCardClick}
    >
      {/* 渐变描边 */}
      <div className="pointer-events-none absolute inset-px rounded-[14px] bg-gradient-to-b from-white/5 to-transparent" />

      {/* 删除按钮 */}
      <button
        onClick={handleDeleteClick}
        className={`absolute top-2 right-2 z-20 p-2 rounded-full text-white transition-all duration-200 ${
          isConfirmingDelete 
            ? 'bg-red-600 hover:bg-red-700 scale-110' 
            : 'bg-black/50 backdrop-blur hover:bg-black/60'
        }`}
        aria-label={isConfirmingDelete ? "Confirm delete" : "Delete movie"}
      >
        {isConfirmingDelete ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099a.75.75 0 00-1.06 0L3.099 7.196a.75.75 0 101.06 1.06L8 4.717l3.841 3.545a.75.75 0 101.06-1.06L9.318 3.1a.75.75 0 00-1.06-.001z" clipRule="evenodd" />
            <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.5a.75.75 0 01-1.5 0V3.75A.75.75 0 0110 3zM4.25 9.75a.75.75 0 01.75-.75h10a.75.75 0 010 1.5H5a.75.75 0 01-.75-.75z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </button>
      
      {/* 删除加载遮罩 */}
      {isDeleting && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-30">
          <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-white mt-2 text-sm">删除中...</span>
        </div>
      )}

      {/* 封面区域 */}
      <div className={`relative overflow-hidden bg-slate-800/80 min-h-[220px] flex items-center justify-center ${isConfirmingDelete ? 'opacity-50' : ''}`}>
        {/* 播放覆层 */}
        <div className="absolute inset-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-t from-black/70 via-black/10 to-transparent flex items-center justify-center">
          <div className="h-12 w-12 rounded-full bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center shadow-lg">
            <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </div>
        </div>

        {/* 抽帧角标 */}
        {usedFrameThumb && (
          <div className="absolute left-2 top-2 z-10 px-2 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            抽帧封面
          </div>
        )}

        {/* 封面图 */}
        <img
          src={details?.coverUrl || "/placeholder-image.svg"}
          alt={details?.displayTitle || movie.filename}
          className="w-full h-auto object-contain max-h-[420px] transition-transform duration-500 group-hover:scale-[1.02]"
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      </div>
      
      {/* 信息区 */}
      <div className={`p-3 space-y-2 ${isConfirmingDelete ? 'opacity-50' : ''}`}>
        <div className="text-sm font-semibold text-white leading-tight line-clamp-2">
          {details ? (details.displayTitle || details.title) : (movie.title || movie.filename)}
        </div>
        
        <div className="flex flex-wrap gap-1.5">
          {movie.code && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/15 text-blue-300 border border-blue-500/30">番号 {movie.code}</span>
          )}
          {details?.actress && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-pink-500/15 text-pink-300 border border-pink-500/30">女优 {details.actress}</span>
          )}
          {movie.year && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">年份 {movie.year}</span>
          )}
          {usedFrameThumb && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">由视频抽帧</span>
          )}
        </div>
        
        {details?.elo && details.elo !== 1000 && (
          <div className="rounded-lg p-2 space-y-1 bg-slate-800/70 border border-slate-700">
            <div className="flex items-center justify-between text-xs">
              <span className="text-yellow-300 font-bold">Elo评分: {details.elo}</span>
              {details.winRate !== undefined && <span className="text-gray-300">胜率: {(details.winRate * 100).toFixed(1)}%</span>}
            </div>
            {details.matchCount !== undefined && details.matchCount > 0 && <div className="text-xs text-gray-300">对战记录: {details.winCount || 0}胜 {details.drawCount || 0}平 {details.lossCount || 0}负</div>}
          </div>
        )}
        
        <div className="flex justify-between items-center text-xs text-gray-400 pt-2 border-t border-slate-800">
          <span>{formatFileSize(movie.size)}</span>
          <span>{new Date(movie.modifiedAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
};

export default MovieCardLazy;