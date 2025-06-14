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
      <div className="absolute bottom-0 left-0 right-0 w-full py-2 px-4 backdrop-blur-md bg-black/50 text-white text-sm">
        <h3 className="text-lg font-semibold truncate mb-1">
          {movie.displayTitle || movie.title || movie.filename}
        </h3>
        {movie.code && <p className="text-sm text-gray-300">番号: {movie.code}</p>}
        {movie.actress && <p className="text-sm text-gray-300">女优: {movie.actress}</p>}
        <p className="text-sm text-gray-300">大小: {formatFileSize(movie.size)}</p>
        <p className="text-sm text-gray-300">修改时间: {new Date(movie.modifiedAt).toLocaleDateString()}</p>
      </div>
    </div>
  );
};

export default MovieCard; 