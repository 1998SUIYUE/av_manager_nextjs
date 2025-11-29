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
          target.src = data.imageUrl;
          return;
        }
      }
    } catch (err) {
      // 忽略错误，继续降级
      console.warn('fallback thumbnail failed', err);
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
      className="relative bg-gray-800 rounded-lg overflow-hidden shadow-lg transform transition duration-300 hover:scale-105 cursor-pointer"
      onClick={handleCardClick}
    >
      {/* --- 删除按钮 --- */}
      <button
        onClick={handleDeleteClick}
        className={`absolute top-2 right-2 z-10 p-1.5 rounded-full text-white transition-all duration-200 ${
          isConfirmingDelete 
            ? 'bg-red-600 hover:bg-red-700 scale-110' 
            : 'bg-black bg-opacity-50 hover:bg-opacity-75'
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
      
      {/* --- 删除加载遮罩 --- */}
      {isDeleting && (
        <div className="absolute inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center z-20">
          <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-white mt-2 text-sm">删除中...</span>
        </div>
      )}

      <div className={`relative overflow-hidden bg-gray-700 min-h-[200px] flex items-center justify-center ${isConfirmingDelete ? 'opacity-50' : ''}`}>
        <img
          src={details?.coverUrl || "/placeholder-image.svg"}
          alt={details?.displayTitle || movie.filename}
          className="w-full h-auto object-contain max-h-[400px]"
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      </div>
      
      <div className={`p-3 space-y-2 ${isConfirmingDelete ? 'opacity-50' : ''}`}>
        <div className="text-sm font-semibold text-white leading-tight">
          {details ? (details.displayTitle || details.title) : (movie.title || movie.filename)}
        </div>
        
        <div className="space-y-1">
          {movie.code && <div className="text-xs text-blue-300"><span className="font-medium">番号:</span> {movie.code}</div>}
          {details?.actress && <div className="text-xs text-pink-300"><span className="font-medium">女优:</span> {details.actress}</div>}
          {movie.year && <div className="text-xs text-green-300"><span className="font-medium">年份:</span> {movie.year}</div>}
        </div>
        
        {details?.elo && details.elo !== 1000 && (
          <div className="bg-gray-700 rounded p-2 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-yellow-300 font-bold">Elo评分: {details.elo}</span>
              {details.winRate !== undefined && <span className="text-gray-300">胜率: {(details.winRate * 100).toFixed(1)}%</span>}
            </div>
            {details.matchCount !== undefined && details.matchCount > 0 && <div className="text-xs text-gray-300">对战记录: {details.winCount || 0}胜 {details.drawCount || 0}平 {details.lossCount || 0}负</div>}
          </div>
        )}
        
        <div className="flex justify-between items-center text-xs text-gray-400 pt-1 border-t border-gray-700">
          <span>{formatFileSize(movie.size)}</span>
          <span>{new Date(movie.modifiedAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
};

export default MovieCardLazy;