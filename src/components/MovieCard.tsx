import React from 'react';

interface MovieCardProps {
  movie: {
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
    // Elo评分相关字段
    elo?: number;
    matchCount?: number;
    winCount?: number;
    drawCount?: number;
    lossCount?: number;
    winRate?: number;
  };
  formatFileSize: (bytes: number) => string;
  onMovieClick: (absolutePath: string) => void;
}

const MovieCard: React.FC<MovieCardProps> = ({ movie, formatFileSize, onMovieClick }) => {
  return (
    <div
      className="bg-gray-800 rounded-lg overflow-hidden shadow-lg transform transition duration-300 hover:scale-105 cursor-pointer"
      onClick={() => onMovieClick(movie.absolutePath)}
    >
      {/* 海报图片区域 - 保持原始比例 */}
      <div className="relative overflow-hidden">
        <img
          src={movie.coverUrl || "/placeholder-image.svg"}
          alt={movie.displayTitle || movie.title || movie.filename}
          className="w-full h-auto object-contain"
          onError={(e) => {
            e.currentTarget.src = "/placeholder-image.svg";
          }}
        />
      </div>
      
      {/* 电影信息区域 - 在海报下方 */}
      <div className="p-3 space-y-2">
        {/* 标题 */}
        <div className="text-sm font-semibold text-white leading-tight">
          {movie.displayTitle || movie.title || movie.filename}
        </div>
        
        {/* 番号和女优信息 */}
        <div className="space-y-1">
          {movie.code && (
            <div className="text-xs text-blue-300">
              <span className="font-medium">番号:</span> {movie.code}
            </div>
          )}
          {movie.actress && (
            <div className="text-xs text-pink-300">
              <span className="font-medium">女优:</span> {movie.actress}
            </div>
          )}
          {movie.year && (
            <div className="text-xs text-green-300">
              <span className="font-medium">年份:</span> {movie.year}
            </div>
          )}
        </div>
        
        {/* Elo评分信息 */}
        {movie.elo && movie.elo !== 1000 && (
          <div className="bg-gray-700 rounded p-2 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-yellow-300 font-bold">Elo评分: {movie.elo}</span>
              {movie.winRate && (
                <span className="text-gray-300">胜率: {(movie.winRate * 100).toFixed(1)}%</span>
              )}
            </div>
            {movie.matchCount && movie.matchCount > 0 && (
              <div className="text-xs text-gray-300">
                对战记录: {movie.winCount || 0}胜 {movie.drawCount || 0}平 {movie.lossCount || 0}负
              </div>
            )}
          </div>
        )}
        
        {/* 文件信息 */}
        <div className="flex justify-between items-center text-xs text-gray-400 pt-1 border-t border-gray-700">
          <span>{formatFileSize(movie.size)}</span>
          <span>{new Date(movie.modifiedAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
};

export default MovieCard; 