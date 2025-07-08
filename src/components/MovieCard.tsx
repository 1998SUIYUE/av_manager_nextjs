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
      className="bg-gray-800 rounded-lg overflow-hidden shadow-lg transform transition duration-300 hover:scale-105 cursor-pointer relative"
      onClick={() => onMovieClick(movie.absolutePath)}
    >
      <img
        src={movie.coverUrl || "/placeholder-image.svg"}
        alt={movie.displayTitle || movie.title || movie.filename}
        className="w-full object-contain"
        onError={(e) => {
          e.currentTarget.src = "/placeholder-image.svg";
        }}
      />
      <div className="absolute bottom-0 left-0 right-0 w-full h-1/3 text-white overflow-hidden bg-gradient-to-t from-black/80 to-transparent">
        <div className="h-full flex flex-col justify-end p-3 space-y-1">
          <div className="text-base font-semibold truncate leading-tight text-white drop-shadow-sm">
            {movie.displayTitle || movie.title || movie.filename}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-100">
            {movie.code && <span className="drop-shadow-sm">番号: {movie.code}</span>}
            {movie.actress && <span className="drop-shadow-sm">女优: {movie.actress}</span>}
          </div>
          {/* 显示Elo评分信息 */}
          {movie.elo && movie.elo !== 1000 && (
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-yellow-200 font-bold drop-shadow-sm">Elo: {movie.elo}</span>
              {movie.matchCount && movie.matchCount > 0 && (
                <span className="text-gray-100 drop-shadow-sm">
                  ({movie.winCount || 0}胜 {movie.drawCount || 0}平 {movie.lossCount || 0}负)
                </span>
              )}
            </div>
          )}
          <div className="flex justify-between text-xs text-gray-100">
            <span className="drop-shadow-sm">{formatFileSize(movie.size)}</span>
            <span className="drop-shadow-sm">{new Date(movie.modifiedAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MovieCard; 