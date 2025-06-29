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
  glassSettings?: {
    blurIntensity: number;
    saturation: number;
    backgroundOpacity: number;
    gradientFromOpacity: number;
    gradientToOpacity: number;
    borderOpacity: number;
    overlayHeight: number;
  };
}

const MovieCard: React.FC<MovieCardProps> = ({ movie, formatFileSize, onMovieClick, glassSettings }) => {
  // 默认毛玻璃设置
  const defaultGlassSettings = {
    blurIntensity: 3,
    saturation: 150,
    backgroundOpacity: 40,
    gradientFromOpacity: 70,
    gradientToOpacity: 30,
    borderOpacity: 10,
    overlayHeight: 33,
  };

  const settings = glassSettings || defaultGlassSettings;

  // 生成动态样式类名


  const getHeightClass = (height: number) => {
    if (height <= 25) return 'h-1/4';
    if (height <= 33) return 'h-1/3';
    if (height <= 40) return 'h-2/5';
    return 'h-1/2';
  };

  // iOS 16 风格的毛玻璃效果
  const overlayStyle = {
    background: `
      linear-gradient(to top, 
        rgba(0,0,0,${settings.gradientFromOpacity / 100}), 
        rgba(0,0,0,${settings.gradientToOpacity / 100})
      ),
      linear-gradient(135deg, 
        rgba(255,255,255,0.1) 0%, 
        rgba(255,255,255,0.05) 50%, 
        rgba(0,0,0,0.1) 100%
      )
    `,
    backdropFilter: `blur(${settings.blurIntensity * 6}px) saturate(${settings.saturation}%) brightness(1.1) contrast(1.1)`,
    borderTop: `1px solid rgba(255,255,255,${settings.borderOpacity / 100})`,
    boxShadow: `
      inset 0 1px 0 rgba(255,255,255,0.2),
      inset 0 -1px 0 rgba(0,0,0,0.1),
      0 -4px 8px rgba(0,0,0,0.3)
    `,
    position: 'relative' as const,
  };

  // iOS 16 风格的噪点纹理
  const noiseOverlayStyle = {
    background: `
      radial-gradient(circle at 20% 80%, rgba(120,119,198,0.3) 0%, transparent 50%),
      radial-gradient(circle at 80% 20%, rgba(255,255,255,0.15) 0%, transparent 50%),
      radial-gradient(circle at 40% 40%, rgba(120,119,198,0.2) 0%, transparent 50%)
    `,
    mixBlendMode: 'overlay' as const,
    opacity: 0.6,
  };
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
      <div 
        className={`absolute bottom-0 left-0 right-0 w-full ${getHeightClass(settings.overlayHeight)} text-white overflow-hidden`}
        style={overlayStyle}
      >
        {/* iOS 16 风格的噪点纹理层 */}
        <div 
          className="absolute inset-0 w-full h-full"
          style={noiseOverlayStyle}
        />
        
        {/* 内容层 */}
        <div className="relative z-10 h-full flex flex-col justify-end p-3 space-y-1">
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