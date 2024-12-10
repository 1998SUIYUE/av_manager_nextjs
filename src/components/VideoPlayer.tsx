import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";

// 定义更详细的错误类型
interface VideoError {
  code: number;
  message: string;
  details?: string;
}

// 获取媒体错误信息的辅助函数
function getMediaErrorMessage(code: number): string {
  switch (code) {
    case 1:
      return "获取资源时出错";
    case 2:
      return "网络错误";
    case 3:
      return "解码错误";
    case 4:
      return "URL不可用";
    default:
      return "未知错误";
  }
}

interface VideoPlayerProps {
  filepath?: string;
  src: string;
  className?: string;
  muted?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  playbackRate?: number;
  volume?: number;
  poster?: string;
  seekSeconds?: number;
  forwardSeconds?: number;
  filename?: string;
  onError?: (error: VideoError) => void;
  onLoadStart?: () => void;
  onCanPlay?: () => void;
  onProgress?: (progress: { buffered: number; duration: number }) => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  filepath,
  src,
  // className,
  muted = false,
  autoPlay = true,
  loop = false,
  playbackRate = 1,
  volume = 1,
  poster,
  seekSeconds,
  forwardSeconds = 10,
  filename,
  onError,
  onLoadStart,
  onCanPlay,
  onProgress,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<VideoError | null>(null);

  // 性能优化：使用 useCallback 缓存事件处理函数
  const handleError = useCallback(
    (e: Event) => {
      const videoElement = e.target as HTMLVideoElement;
      const mediaError = videoElement.error;

      const errorDetails: VideoError = {
        code: mediaError?.code || 0,
        message: getMediaErrorMessage(mediaError?.code || 0),
        details: `Source: ${videoElement.src}, Network State: ${videoElement.networkState}`,
      };

      setError(errorDetails);
      setIsLoading(false);

      if (onError) {
        onError(errorDetails);
      }
    },
    [onError]
  );

  const handleLoadStart = useCallback(() => {
    setIsLoading(true);
    if (onLoadStart) onLoadStart();
  }, [onLoadStart]);

  const handleCanPlay = useCallback(() => {
    setIsLoading(false);
    if (onCanPlay) onCanPlay();
  }, [onCanPlay]);

  const handleProgress = useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (onProgress && videoElement.buffered.length > 0) {
      const bufferedEnd = videoElement.buffered.end(
        videoElement.buffered.length - 1
      );
      onProgress({
        buffered: (bufferedEnd / videoElement.duration) * 100,
        duration: videoElement.duration,
      });
    }
  }, [onProgress]);

  // 性能和功能优化：使用 useEffect 管理视频状态
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    // 设置视频属性
    videoElement.muted = muted;
    videoElement.volume = volume;
    videoElement.playbackRate = playbackRate;
    videoElement.loop = loop;

    if (seekSeconds) {
      videoElement.currentTime = seekSeconds;
    }

    // 事件监听器
    const events = [
      { name: "error", handler: handleError },
      { name: "loadstart", handler: handleLoadStart },
      { name: "canplay", handler: handleCanPlay },
      { name: "progress", handler: handleProgress },
    ];

    events.forEach((event) => {
      videoElement.addEventListener(event.name, event.handler);
    });

    return () => {
      events.forEach((event) => {
        videoElement.removeEventListener(event.name, event.handler);
      });
    };
  }, [
    muted,
    volume,
    playbackRate,
    loop,
    seekSeconds,
    handleError,
    handleLoadStart,
    handleCanPlay,
    handleProgress,
  ]);

  // 添加键盘事件处理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const videoElement = videoRef.current;
      if (!videoElement) return;

      // 右键快进
      if (e.key === "ArrowRight") {
        e.preventDefault(); // 阻止默认行为
        const currentTime = videoElement.currentTime;
        videoElement.currentTime = Math.min(
          currentTime + forwardSeconds,
          videoElement.duration
        );
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [forwardSeconds]);

  const openInExplorer = async () => {
    try {
      console.log("video打开文件位置:", filepath);
      const response = await fetch("/api/open-file", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ filePath: filepath }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "打开文件位置失败");
      }
      const data = await response.json();
      const message = data.message;
      if (message) {
        console.log(message);
      }
    } catch (error) {
      console.error("打开文件位置出错:", error);
      alert(error instanceof Error ? error.message : "无法打开文件位置");
    }
  };

  // 错误状态渲染
  const ErrorDisplay = useMemo(() => {
    if (!error) return null;
    return (
      <div className="text-red-500 p-2 bg-red-100 rounded">
        视频加载错误：{error.message}
        {error.details && <p className="text-xs">{error.details}</p>}
      </div>
    );
  }, [error]);

  // 加载状态渲染
  const LoadingIndicator = useMemo(() => {
    if (!isLoading) return null;
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-white"></div>
      </div>
    );
  }, [isLoading]);

  return (
    <div className="relative w-full group">
      <video
        preload="auto"
        ref={videoRef}
        src={src}
        poster={poster}
        controls
        autoPlay={autoPlay}
        muted={muted}
        className="w-full max-h-[80vh] bg-black"
        style={{ maxWidth: "100%" }}
        crossOrigin="anonymous"
        playsInline // 移动设备内联播放
      >
        您的浏览器不支持视频标签。
      </video>
      {filename && (
        <div
          className="absolute top-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm max-w-[80%] truncate 
                     opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        >
          <span
            onClick={openInExplorer}
            className="cursor-pointer hover:underline"
          >
            {filename}
          </span>
        </div>
      )}
      {LoadingIndicator}
      {ErrorDisplay}
    </div>
  );
};

export default VideoPlayer;
