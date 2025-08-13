"use client";

import React, { useEffect, useRef, useCallback } from "react";

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

const VideoPlayerClient: React.FC<VideoPlayerClientProps> = ({
  src,
  filename,
  stepSeconds = 10,
  autoPlay = true,
  muted = false,
  loop = false,
  controls = true,
  poster,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

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
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        controls={controls}
        autoPlay={autoPlay}
        muted={muted}
        loop={loop}
        tabIndex={-1}
        onMouseDown={(e) => { e.preventDefault(); containerRef.current?.focus(); }}
        onFocus={(e) => { e.preventDefault(); containerRef.current?.focus(); }}
        onPlay={refocusContainer}
        onPause={refocusContainer}
        onSeeked={refocusContainer}
        className="w-full h-full bg-black object-contain"
        playsInline
      >
        您的浏览器不支持视频标签。
      </video>

      {filename && (
        <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
          {filename}
        </div>
      )}
    </div>
  );
};

export default VideoPlayerClient;
