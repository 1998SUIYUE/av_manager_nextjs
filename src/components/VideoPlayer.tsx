import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { devWithTimestamp } from "@/utils/logger";

interface VideoError {
  code: number;
  message: string;
  details?: string;
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
  onPlayStart?: (progress: { currentTime: number; duration: number }) => void;
  onTimeUpdate?: (progress: { currentTime: number; duration: number }) => void;
  controls?: boolean;
  onEnded?: (progress?: { currentTime: number; duration: number }) => void;
}

interface ExtendedHTMLVideoElement {
  preservesPitch?: boolean;
}

function getMediaErrorMessage(code: number): string {
  switch (code) {
    case 1:
      return "获取资源时出错";
    case 2:
      return "网络错误";
    case 3:
      return "解码错误";
    case 4:
      return "视频地址不可用";
    default:
      return "未知错误";
  }
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  filepath,
  src,
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
  onPlayStart,
  onTimeUpdate,
  controls = true,
  onEnded,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  void filepath;
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<VideoError | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [forwardStep, setForwardStep] = useState(forwardSeconds);
  const forwardStepRef = useRef(forwardSeconds);
  const lastTimeUpdateSentRef = useRef(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    forwardStepRef.current = forwardStep;
  }, [forwardStep]);

  const handleError = useCallback(
    (event: Event) => {
      const videoElement = event.target as HTMLVideoElement;
      const mediaError = videoElement.error;
      const errorDetails: VideoError = {
        code: mediaError?.code || 0,
        message: getMediaErrorMessage(mediaError?.code || 0),
        details: `Source: ${videoElement.src}, Network State: ${videoElement.networkState}`,
      };

      setError(errorDetails);
      setIsLoading(false);
      onError?.(errorDetails);
    },
    [onError]
  );

  const handleLoadStart = useCallback(() => {
    setIsLoading(true);
    setError(null);
    onLoadStart?.();
  }, [onLoadStart]);

  const handleCanPlay = useCallback(() => {
    setIsLoading(false);
    onCanPlay?.();
  }, [onCanPlay]);

  const handleProgress = useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !onProgress || videoElement.buffered.length === 0) return;

    const duration = videoElement.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;

    const bufferedEnd = videoElement.buffered.end(videoElement.buffered.length - 1);
    onProgress({
      buffered: (bufferedEnd / duration) * 100,
      duration,
    });
  }, [onProgress]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    const videoElement = videoRef.current;
    if (!videoElement || !onPlayStart) return;
    onPlayStart({
      currentTime: videoElement.currentTime || 0,
      duration: Number.isFinite(videoElement.duration) ? videoElement.duration : 0,
    });
  }, [onPlayStart]);

  const handleTimeUpdate = useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !onTimeUpdate) return;

    const now = Date.now();
    if (now - lastTimeUpdateSentRef.current < 5000) return;
    lastTimeUpdateSentRef.current = now;

    onTimeUpdate({
      currentTime: videoElement.currentTime || 0,
      duration: Number.isFinite(videoElement.duration) ? videoElement.duration : 0,
    });
  }, [onTimeUpdate]);

  const handleEnded = useCallback(() => {
    const videoElement = videoRef.current;
    const progress = videoElement
      ? {
          currentTime: Number.isFinite(videoElement.duration) ? videoElement.duration : videoElement.currentTime || 0,
          duration: Number.isFinite(videoElement.duration) ? videoElement.duration : 0,
        }
      : undefined;
    if (videoElement && onTimeUpdate) {
      onTimeUpdate(progress!);
    }
    onEnded?.(progress);
  }, [onEnded, onTimeUpdate]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    videoElement.muted = muted;
    videoElement.volume = volume;
    videoElement.playbackRate = playbackRate;
    videoElement.loop = loop;

    if (seekSeconds) {
      videoElement.currentTime = seekSeconds;
    }

    try {
      const extendedVideo = videoElement as unknown as ExtendedHTMLVideoElement;
      if ("preservesPitch" in videoElement) {
        extendedVideo.preservesPitch = false;
      }
      videoElement.style.transform = "translateZ(0)";
      videoElement.style.backfaceVisibility = "hidden";
      videoElement.style.willChange = "transform";
    } catch (error) {
      devWithTimestamp("设置视频高性能模式失败:", error);
    }

    videoElement.addEventListener("error", handleError);
    videoElement.addEventListener("loadstart", handleLoadStart);
    videoElement.addEventListener("canplay", handleCanPlay);
    videoElement.addEventListener("progress", handleProgress);
    videoElement.addEventListener("play", handlePlay);
    videoElement.addEventListener("pause", handlePause);
    videoElement.addEventListener("timeupdate", handleTimeUpdate);
    videoElement.addEventListener("ended", handleEnded);

    return () => {
      videoElement.removeEventListener("error", handleError);
      videoElement.removeEventListener("loadstart", handleLoadStart);
      videoElement.removeEventListener("canplay", handleCanPlay);
      videoElement.removeEventListener("progress", handleProgress);
      videoElement.removeEventListener("play", handlePlay);
      videoElement.removeEventListener("pause", handlePause);
      videoElement.removeEventListener("timeupdate", handleTimeUpdate);
      videoElement.removeEventListener("ended", handleEnded);
    };
  }, [
    muted,
    volume,
    playbackRate,
    loop,
    seekSeconds,
    handleError,
    handlePause,
    handleLoadStart,
    handleCanPlay,
    handleProgress,
    handlePlay,
    handleTimeUpdate,
    handleEnded,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const videoElement = videoRef.current;
      if (!videoElement) return;

      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        const duration = Number.isFinite(videoElement.duration) ? videoElement.duration : Number.MAX_SAFE_INTEGER;
        videoElement.currentTime = Math.min(videoElement.currentTime + forwardStepRef.current, duration);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        videoElement.currentTime = Math.max(videoElement.currentTime - forwardStepRef.current, 0);
      } else if (event.key === " ") {
        event.preventDefault();
        if (videoElement.paused) {
          videoElement.play();
        } else {
          videoElement.pause();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true } as AddEventListenerOptions);
    };
  }, []);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const errorDisplay = useMemo(() => {
    if (!error) return null;
    return (
      <div className="absolute left-3 top-3 z-20 max-w-[80%] rounded bg-red-950/90 p-3 text-sm text-red-100 shadow-lg">
        视频加载错误：{error.message}
      </div>
    );
  }, [error]);

  const loadingIndicator = useMemo(() => {
    if (!isLoading) return null;
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-white" />
      </div>
    );
  }, [isLoading]);

  return (
    <div
      className="group relative h-full w-full"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        controls={controls}
        autoPlay={autoPlay}
        muted={muted}
        preload="metadata"
        className={`h-full w-full bg-black object-contain outline-none ${
          controls && isPlaying && !isHovered && !isMobile ? "hide-native-video-controls" : ""
        }`}
        style={{ maxWidth: "100%", maxHeight: "100%" }}
        playsInline
        tabIndex={-1}
      >
        您的浏览器不支持视频播放。
      </video>

      {filename && !isMobile && (
        <div className="absolute left-2 top-2 max-w-[80%] rounded bg-black/50 px-2 py-1 text-sm text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="block truncate">{filename}</span>
        </div>
      )}

      {loadingIndicator}
      {errorDisplay}

      <div className="absolute bottom-16 right-2 z-10 flex space-x-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setForwardStep(5);
          }}
          className={`rounded px-3 py-1 text-xs font-semibold ${
            forwardStep === 5 ? "bg-blue-600 text-white" : "bg-black/50 text-white"
          }`}
        >
          5s
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setForwardStep(10);
          }}
          className={`rounded px-3 py-1 text-xs font-semibold ${
            forwardStep === 10 ? "bg-blue-600 text-white" : "bg-black/50 text-white"
          }`}
        >
          10s
        </button>
      </div>
    </div>
  );
};

export default VideoPlayer;

