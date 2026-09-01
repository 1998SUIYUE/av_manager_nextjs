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
  // 父组件传入的回调多为内联函数、每次渲染引用都会变，事件监听只在挂载时绑定一次，
  // 触发时从这里取最新回调
  const callbacksRef = useRef({ onError, onLoadStart, onCanPlay, onProgress, onPlayStart, onTimeUpdate, onEnded });
  const seekedSrcRef = useRef<string | null>(null);

  useEffect(() => {
    callbacksRef.current = { onError, onLoadStart, onCanPlay, onProgress, onPlayStart, onTimeUpdate, onEnded };
  });

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
      callbacksRef.current.onError?.(errorDetails);
    },
    []
  );

  const handleLoadStart = useCallback(() => {
    setIsLoading(true);
    setError(null);
    callbacksRef.current.onLoadStart?.();
  }, []);

  const handleCanPlay = useCallback(() => {
    setIsLoading(false);
    callbacksRef.current.onCanPlay?.();
  }, []);

  const handleProgress = useCallback(() => {
    const videoElement = videoRef.current;
    const { onProgress } = callbacksRef.current;
    if (!videoElement || !onProgress || videoElement.buffered.length === 0) return;

    const duration = videoElement.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;

    const bufferedEnd = videoElement.buffered.end(videoElement.buffered.length - 1);
    onProgress({
      buffered: (bufferedEnd / duration) * 100,
      duration,
    });
  }, []);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    const videoElement = videoRef.current;
    const { onPlayStart } = callbacksRef.current;
    if (!videoElement || !onPlayStart) return;
    onPlayStart({
      currentTime: videoElement.currentTime || 0,
      duration: Number.isFinite(videoElement.duration) ? videoElement.duration : 0,
    });
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const videoElement = videoRef.current;
    const { onTimeUpdate } = callbacksRef.current;
    if (!videoElement || !onTimeUpdate) return;

    const now = Date.now();
    if (now - lastTimeUpdateSentRef.current < 5000) return;
    lastTimeUpdateSentRef.current = now;

    onTimeUpdate({
      currentTime: videoElement.currentTime || 0,
      duration: Number.isFinite(videoElement.duration) ? videoElement.duration : 0,
    });
  }, []);

  const handleEnded = useCallback(() => {
    const videoElement = videoRef.current;
    const { onTimeUpdate, onEnded } = callbacksRef.current;
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
  }, []);

  // 媒体属性只随 props 本身变化同步；若随父组件重渲染反复执行，
  // 会把用户通过原生控件设置的静音/音量覆盖回 props 默认值
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    videoElement.muted = muted;
    videoElement.volume = volume;
    videoElement.playbackRate = playbackRate;
    videoElement.loop = loop;
  }, [muted, volume, playbackRate, loop]);

  // 起播位置只在换片时应用一次；进度上报会持续更新 seekSeconds，
  // 跟随变化会把播放位置拉回上次保存点
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !seekSeconds) return;
    if (seekedSrcRef.current === src) return;
    seekedSrcRef.current = src;
    videoElement.currentTime = seekSeconds;
  }, [src, seekSeconds]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

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

