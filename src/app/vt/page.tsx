// src/app/vt/page.tsx

'use client';

import { useRef, useEffect } from 'react';

export default function VideoTestPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 快进逻辑，保持不变
  const handleFastForward = () => {
    const video = videoRef.current;
    if (!video || isNaN(video.duration)) return;
    video.currentTime += 10;
  };

  // 键盘事件处理，保持不变
  const handleContainerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') {
      console.log('方向右键被按下，执行快进。');
      handleFastForward();
      event.preventDefault();
    }
  };

  // 1. (新增) 创建一个函数，它的唯一作用就是把焦点抢回来
  const refocusContainer = () => {
    console.log('视频被操作，正在将焦点抢回主容器...');
    containerRef.current?.focus();
  };

  // 组件加载时自动聚焦，保持不变
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  return (
    <div
      ref={containerRef}
      onKeyDown={handleContainerKeyDown}
      tabIndex={-1}
      style={{ padding: '50px', outline: 'none' }}
    >
      <h1>最终版视频播放器</h1>
      <p>现在，无论你如何操作视频控件，键盘快捷键都将始终有效！</p>
      <video
        ref={videoRef}
        src="/api/video/stream?path=ZCUzQSU1Q1FfZG93bmxvYWQlNUNTT05FLTY4Ny1DLm1wNA=="
        width="600"
        controls
        // 2. (核心修改) 在这些会“偷走”焦点的事件上，调用我们的“抢回焦点”函数
        onPlay={refocusContainer}
        onPause={refocusContainer}
        onSeeked={refocusContainer} // onSeeked 会在用户拖动进度条后触发
      >
        你的浏览器不支持视频标签。
      </video>
      <div style={{ marginTop: '20px' }}>
        <button 
          onClick={handleFastForward} 
          style={{ fontSize: '18px', padding: '10px' }}
        >
          快进 10 秒 (或按 → 键)
        </button>
      </div>
    </div>
  );
}