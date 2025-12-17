"use client";

import React, { useEffect, useRef, useCallback, useState } from "react";

type VideoPlayerClientProps = {
  src: string;
  filename?: string;
  stepSeconds?: number;   // 快进/快退步长，默认 10s
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  poster?: string;
};

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

// 将秒数格式化为 hh:mm:ss 或 mm:ss，适配 NaN/Infinity 等情况
function formatTime(totalSeconds: number): string {
  if (!isFinite(totalSeconds) || isNaN(totalSeconds) || totalSeconds < 0) return "00:00";
  const sec = Math.floor(totalSeconds);
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  const two = (n: number) => n.toString().padStart(2, "0");
  if (hours > 0) return `${hours}:${two(minutes)}:${two(seconds)}`;
  return `${two(minutes)}:${two(seconds)}`;
}

const VideoPlayerClient: React.FC<VideoPlayerClientProps> = ({
  src,
  filename,
  stepSeconds = 5,
  autoPlay = true,
  muted = false,
  loop = false,
  controls = true,
  poster,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // 打开时自动聚焦容器，便于接收键盘事件
  useEffect(() => {
    const t = setTimeout(() => {
      containerRef.current?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    const duration = isFinite(v.duration) ? v.duration : Number.MAX_SAFE_INTEGER;
    const target = clamp(v.currentTime + delta, 0, duration);
    v.currentTime = target;
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  // 学习 vt 示例：当 video 控件被操作时，立刻把焦点抢回容器，避免原生按键生效
  const refocusContainer = useCallback(() => {
    containerRef.current?.focus();
  }, []);

  // 绑定视频事件用于自定义UI
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onLoaded = () => {
      setDuration(isFinite(v.duration) ? v.duration : 0);
      setIsMuted(v.muted);
    };
    const onTime = () => {
      setCurrentTime(v.currentTime);
      const d = isFinite(v.duration) ? v.duration : 0;
      setDuration(d);
      setProgress(d > 0 ? v.currentTime / d : 0);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    v.addEventListener('loadedmetadata', onLoaded);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);

    return () => {
      v.removeEventListener('loadedmetadata', onLoaded);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
  }, []);

  // 全局兜底：若容器未获焦，也能响应热键（避免“看起来没反应”）
  useEffect(() => {
    const onWinKey = (e: KeyboardEvent) => {
      // 若容器未获焦（例如之前焦点停留在搜索框），仍然接管热键
      if (document.activeElement !== containerRef.current) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          if (e.key === 'ArrowRight') {
            seekBy(stepSeconds);
          } else if (e.key === 'ArrowLeft') {
            seekBy(-stepSeconds);
          } else {
            togglePlay();
          }
        }
      }
    };
    window.addEventListener('keydown', onWinKey, { capture: true });
    return () => window.removeEventListener('keydown', onWinKey, { capture: true } as any);
  }, [seekBy, stepSeconds, togglePlay]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

    e.preventDefault();
    e.stopPropagation();

    if (e.key === "ArrowRight") {
      seekBy(stepSeconds);
    } else if (e.key === "ArrowLeft") {
      seekBy(-stepSeconds);
    } else if (e.key === " ") {
      togglePlay();
    }
  }, [seekBy, stepSeconds, togglePlay]);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="application"
      onKeyDownCapture={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onKeyDown={onKeyDown}
      className="relative w-full h-full outline-none"
      style={{ outline: "none" }}
    >
      {/* 背景渐变与玻璃面板 */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-black to-slate-950" />
      <div className="absolute inset-2 rounded-2xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-sm shadow-2xl shadow-black/50" />

      {/* 自定义控件容器 */}
      <div className="absolute inset-0 z-10 flex flex-col">
        {/* 顶部栏：标题 */}
        {filename && (
          <div className="pointer-events-none flex items-center gap-2 p-3">
            <div className="px-2 py-1 rounded bg-black/40 text-white/90 text-xs border border-white/10 max-w-[70%] truncate">
              {filename}
            </div>
          </div>
        )}

        {/* 底部控制条 */}
        <div className="mt-auto p-4">
          {/* 进度条 */}
          <div
            className="group/progress h-2 rounded-full bg-white/10 cursor-pointer relative"
            onClick={(e) => {
              const rect = (e.target as HTMLDivElement).getBoundingClientRect();
              const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
              const v = videoRef.current;
              if (v && isFinite(v.duration)) {
                v.currentTime = ratio * v.duration;
              }
            }}
          >
            <div className="absolute inset-y-0 left-0 rounded-full bg-blue-500/70" style={{ width: `${progress * 100}%` }} />
            <div className="absolute -top-1 h-4 w-4 rounded-full bg-white shadow group-hover/progress:scale-110 transition-transform" style={{ left: `calc(${progress * 100}% - 8px)` }} />
          </div>

          {/* 控件按钮区 */}
          <div className="mt-3 flex items-center gap-3 text-white">
            {/* Play/Pause */}
            <button
              onClick={() => {
                const v = videoRef.current; if (!v) return;
                if (v.paused) v.play().catch(() => {}); else v.pause();
              }}
              className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/15 backdrop-blur border border-white/20 flex items-center justify-center"
            >
              {isPlaying ? (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>

            {/* Seek -/+ */}
            <button onClick={() => seekBy(-stepSeconds)} className="px-3 h-10 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-sm">-{stepSeconds}s</button>
            <button onClick={() => seekBy(stepSeconds)} className="px-3 h-10 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-sm">+{stepSeconds}s</button>

            {/* Time */}
            <div className="ml-2 text-xs text-white/80 tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Mute */}
            <button
              onClick={() => {
                const v = videoRef.current; if (!v) return; v.muted = !v.muted; setIsMuted(v.muted);
              }}
              className={`h-10 w-10 rounded-full bg-white/10 hover:bg-white/15 backdrop-blur border border-white/20 flex items-center justify-center ${isMuted ? 'text-red-300' : ''}`}
            >
              {isMuted ? (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12l4-4-1.4-1.4-4 4-4-4L9.7 8l4 4-4 4 1.4 1.4 4-4 4 4 1.4-1.4-4-4zM5 9v6h4l5 5V4L9 9H5z"/></svg>
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3z"/></svg>
              )}
            </button>

            {/* Native controls toggle */}
            <button
              onClick={() => {
                const v = videoRef.current; if (!v) return; (v as any).controls = !(v as any).controls;
              }}
              className="px-3 h-10 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-xs"
            >原生控件</button>
          </div>
        </div>
      </div>

      {/* Video behind UI */}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        controls={false}
        autoPlay={autoPlay}
        muted={muted}
        loop={loop}
        tabIndex={-1}
        onMouseDown={(e) => { e.preventDefault(); containerRef.current?.focus(); }}
        onFocus={(e) => { e.preventDefault(); containerRef.current?.focus(); }}
        onPlay={refocusContainer}
        onPause={refocusContainer}
        onSeeked={refocusContainer}
        className="absolute inset-0 w-full h-full bg-black object-contain"
        playsInline
      >
        您的浏览器不支持视频标签。
      </video>
    </div>
  );
};

export default VideoPlayerClient;
