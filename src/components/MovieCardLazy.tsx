/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { formatFileSize } from '@/utils/formatFileSize';

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
}

const MovieCardLazy: React.FC<MovieCardLazyProps> = ({ movie, onMovieClick, onLoaded }) => {
  // The `movie` prop can be partial or full. We use internal state to manage the full details.
  const [details, setDetails] = useState<MovieDetails | null>(
    // If the movie prop already has full details (indicated by coverUrl), use it as the initial state.
    (movie as MovieDetails).coverUrl ? (movie as MovieDetails) : null
  );
  const [isLoading, setIsLoading] = useState(!details); // Only set loading to true if details are not pre-filled
  const [error, setError] = useState<string | null>(null);
  
  // --- Performance Timing State ---
  const [metadataLoadTime, setMetadataLoadTime] = useState<number | null>(null);
  const [imageLoadTime, setImageLoadTime] = useState<number | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const imageLoadStartRef = useRef<number | null>(null);
  const fetchInitiatedRef = useRef(!!details); // If we have details, no need to fetch.

  useEffect(() => {
    // If details are already present from props, we just need to call onLoaded and time the image.
    if (fetchInitiatedRef.current) {
        if(details?.coverUrl && !isImageLoading && imageLoadTime === null) {
            setIsImageLoading(true);
            imageLoadStartRef.current = performance.now();
        }
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
      const startTime = performance.now();

      try {
        const response = await fetch(`/api/movie-details/${movie.code}`);
        if (!response.ok) {
          throw new Error(`API Error: ${response.statusText}`);
        }
        const data: MovieDetails = await response.json();
        setDetails(data);
        if (data.coverUrl) {
          setIsImageLoading(true);
          imageLoadStartRef.current = performance.now();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'An unknown error occurred');
        console.error(`Failed to load details for ${movie.code}`, e);
      } finally {
        const endTime = performance.now();
        setMetadataLoadTime(Math.round(endTime - startTime));
        setIsLoading(false);
        onLoaded();
      }
    };

    fetchDetails();
  }, [movie, onLoaded, details, isImageLoading, imageLoadTime]);

  const handleImageLoad = () => {
    if (imageLoadStartRef.current) {
      const endTime = performance.now();
      setImageLoadTime(Math.round(endTime - imageLoadStartRef.current));
      imageLoadStartRef.current = null;
    }
    setIsImageLoading(false);
  };

  const handleImageError = () => {
    setImageLoadTime(null);
    setIsImageLoading(false);
  };

  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-lg overflow-hidden shadow-lg animate-pulse">
        <div className="bg-gray-700 h-56 w-full"></div>
        <div className="p-3 space-y-3">
          <div className="h-4 bg-gray-700 rounded w-3/4"></div>
          <div className="h-3 bg-gray-700 rounded w-1/2"></div>
          <div className="h-3 bg-gray-700 rounded w-1/4"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg overflow-hidden shadow-lg border border-red-500/50">
        <div className="bg-gray-700 h-56 w-full flex items-center justify-center">
            <span className='text-red-400 text-xs text-center p-2'>加载失败</span>
        </div>
        <div className="p-3">
          <p className="text-sm font-semibold text-white leading-tight truncate">{movie.filename}</p>
          <p className="text-xs text-red-400 mt-2">Error: {error}</p>
          {metadataLoadTime !== null && <p className="text-xs text-gray-500">耗时: {metadataLoadTime}ms</p>}
        </div>
      </div>
    );
  }

  const finalDetails = details || movie;

  return (
    <div
      className="bg-gray-800 rounded-lg overflow-hidden shadow-lg transform transition duration-300 hover:scale-105 cursor-pointer"
      onClick={() => onMovieClick(movie.absolutePath)}
    >
      <div className="relative overflow-hidden bg-gray-700 min-h-[200px] flex items-center justify-center">
        <img
          src={finalDetails.coverUrl || "/placeholder-image.svg"}
          alt={finalDetails.displayTitle || finalDetails.filename}
          className="w-full h-auto object-contain max-h-[400px]"
          onLoad={handleImageLoad}
          onError={(e) => {
            handleImageError();
            const target = e.currentTarget;
            if (target.src !== window.location.origin + "/placeholder-image.svg") {
              target.src = "/placeholder-image.svg";
            }
          }}
        />
        {(metadataLoadTime !== null || isImageLoading || imageLoadTime !== null) && (
            <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 text-white text-xs p-1 text-center">
                {metadataLoadTime !== null && `详情: ${metadataLoadTime}ms`}
                {isImageLoading && ` | 图片: 加载中...`}
                {imageLoadTime !== null && ` | 图片: ${imageLoadTime}ms`}
            </div>
        )}
      </div>
      
      <div className="p-3 space-y-2">
        <div className="text-sm font-semibold text-white leading-tight">
          {finalDetails.displayTitle || finalDetails.filename}
        </div>
        
        <div className="space-y-1">
          {finalDetails.code && (
            <div className="text-xs text-blue-300">
              <span className="font-medium">番号:</span> {finalDetails.code}
            </div>
          )}
          {finalDetails.actress && (
            <div className="text-xs text-pink-300">
              <span className="font-medium">女优:</span> {finalDetails.actress}
            </div>
          )}
          {finalDetails.year && (
            <div className="text-xs text-green-300">
              <span className="font-medium">年份:</span> {finalDetails.year}
            </div>
          )}
        </div>
        
        {finalDetails.elo && finalDetails.elo !== 1000 && (
          <div className="bg-gray-700 rounded p-2 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-yellow-300 font-bold">Elo评分: {finalDetails.elo}</span>
              {finalDetails.winRate !== undefined && (
                <span className="text-gray-300">胜率: {(finalDetails.winRate * 100).toFixed(1)}%</span>
              )}
            </div>
            {finalDetails.matchCount !== undefined && finalDetails.matchCount > 0 && (
              <div className="text-xs text-gray-300">
                对战记录: {finalDetails.winCount || 0}胜 {finalDetails.drawCount || 0}平 {finalDetails.lossCount || 0}负
              </div>
            )}
          </div>
        )}
        
        <div className="flex justify-between items-center text-xs text-gray-400 pt-1 border-t border-gray-700">
          <span>{formatFileSize(finalDetails.size)}</span>
          <span>{new Date(finalDetails.modifiedAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
};

export default MovieCardLazy;
