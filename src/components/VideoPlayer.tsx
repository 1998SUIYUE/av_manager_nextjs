import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { logWithTimestamp, errorWithTimestamp } from '@/utils/logger'; // 导入日志工具

// 定义更详细的错误类型
interface VideoError {
  code: number;
  message: string;
  details?: string;
}

// 定义视频技术信息接口
interface VideoTechInfo {
  resolution: string;
  frameRate: number | string;
  codec: string;
  bitrate: string;
  dropFrames: number;
  performanceIndex: number;
  bufferingTime: number;
  hardwareAcceleration: boolean;
  renderMode: string;
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

// 辅助函数：检测编解码器类型
async function detectCodec(videoSrc: string): Promise<string> {
  try {
    // 创建一个临时的视频元素
    const tempVideo = document.createElement('video');
    tempVideo.style.display = 'none';
    document.body.appendChild(tempVideo);
    
    // 添加标记以防止重复处理
    let isResolved = false;
    
    return new Promise((resolve) => {
      const safeResolve = (value: string) => {
        if (!isResolved) {
          isResolved = true;
          resolve(value);
        }
      };
      // 设置元数据加载处理
      tempVideo.onloadedmetadata = async () => {
        try {
          // 尝试使用MediaSource扩展API获取编解码信息
          let codecInfo = "未知";
          
          // 首先尝试从video元素直接获取
          // @ts-expect-error - 访问非标准属性
          if (tempVideo.videoTracks && tempVideo.videoTracks.length > 0) {
            // @ts-expect-error - 访问非标准属性
            const track = tempVideo.videoTracks[0];
            if (track.codec) {
              codecInfo = track.codec;
            }
          }
          
          // 如果无法获取，尝试分析源URL中的信息
          if (codecInfo === "未知") {
            const lowerSrc = videoSrc.toLowerCase();
            if (lowerSrc.includes('avc1') || lowerSrc.includes('h264')) {
              codecInfo = "H.264 / AVC";
            } else if (lowerSrc.includes('hevc') || lowerSrc.includes('h265') || lowerSrc.includes('hev1')) {
              codecInfo = "H.265 / HEVC";
            } else if (lowerSrc.includes('av1')) {
              codecInfo = "AV1";
            } else if (lowerSrc.includes('vp9')) {
              codecInfo = "VP9";
            } else if (lowerSrc.includes('vp8')) {
              codecInfo = "VP8";
            }
          }
          
          // 高级检测：通过创建一个MediaSource尝试获取
          if (codecInfo === "未知" && window.MediaSource) {
            if (MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E"')) {
              // 文件很可能是H.264编码
              codecInfo = "可能为 H.264";
            } else if (MediaSource.isTypeSupported('video/mp4; codecs="hev1.1.6.L93.B0"')) {
              // 文件可能是HEVC/H.265编码
              codecInfo = "可能为 H.265";
            }
            
            // 检查文件扩展名辅助判断
            const extension = videoSrc.split('.').pop()?.toLowerCase();
            if (extension === 'mp4') {
              codecInfo += codecInfo === "未知" ? "MP4 (可能是 H.264)" : "";
            } else if (extension === 'mkv') {
              codecInfo += codecInfo === "未知" ? "MKV (可能是 H.264/H.265)" : "";
            } else if (extension === 'webm') {
              codecInfo += codecInfo === "未知" ? "WebM (可能是 VP8/VP9)" : "";
            }
          }
          
          safeResolve(codecInfo);
        } catch (err) {
          console.error("编解码器检测错误:", err);
          safeResolve("未知 (检测出错)");
        } finally {
          // 清理临时元素 - 安全移除
          if (document.body.contains(tempVideo)) {
            document.body.removeChild(tempVideo);
          }
        }
      };
      
      tempVideo.onerror = () => {
        // 安全移除临时元素
        if (document.body.contains(tempVideo)) {
          document.body.removeChild(tempVideo);
        }
        safeResolve("未知 (加载失败)");
      };
      
      // 设置源并加载
      tempVideo.src = videoSrc;
      tempVideo.load();
      
      // 设置超时以防止无限等待
      setTimeout(() => {
        if (document.body.contains(tempVideo)) {
          document.body.removeChild(tempVideo);
        }
        safeResolve("未知 (检测超时)");
      }, 3000);
    });
  } catch (error) {
    console.error("编解码器检测过程错误:", error);
    return "未知 (检测过程异常)";
  }
}

// 检测硬件加速状态
function isHardwareAccelerated(): boolean {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  
  if (!gl) {
    return false;
  }
  
  // 安全检查WebGL上下文
  if (!('getExtension' in gl)) {
    return false;
  }
  
  const webGLContext = gl as WebGLRenderingContext;
  const debugInfo = webGLContext.getExtension('WEBGL_debug_renderer_info');
  if (debugInfo) {
    const renderer = webGLContext.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    // 如果渲染器字符串包含GPU信息，则可能使用了硬件加速
    const gpuIndicators = ['nvidia', 'amd', 'radeon', 'intel', 'geforce', 'gpu', 'hardware'];
    return gpuIndicators.some(indicator => renderer.toLowerCase().includes(indicator));
  }
  
  return false;
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
  controls?: boolean;
}

// 扩展HTML视频元素的类型，以处理非标准属性
interface ExtendedHTMLVideoElement {
  webkitVideoDecodedByteCount?: number;
  mozParsedFrames?: number;
  mozDecodedFrames?: number;
  webkitDecodedFrameCount?: number;
  webkitDroppedFrameCount?: number;
  getVideoPlaybackQuality?: () => {
    droppedVideoFrames: number;
    totalVideoFrames: number;
  };
  // 实验性API
  preservesPitch?: boolean;
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
  controls = true,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<VideoError | null>(null);
  const [showTechInfo, setShowTechInfo] = useState(false);
  const [techInfo, setTechInfo] = useState<VideoTechInfo>({
    resolution: "--",
    frameRate: "--",
    codec: "--",
    bitrate: "--",
    dropFrames: 0,
    performanceIndex: 0,
    bufferingTime: 0,
    hardwareAcceleration: false,
    renderMode: "--"
  });
  const [isMobile, setIsMobile] = useState(false);
  const [bufferedRanges, setBufferedRanges] = useState<{start: number, end: number}[]>([]);
  const [showBufferInfo, setShowBufferInfo] = useState(false);
  
  // 添加显示/隐藏技术信息的切换函数
  const toggleTechInfo = useCallback(() => {
    setShowTechInfo((prev) => !prev);
  }, []);

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
    
    // 视频可以播放时，尝试获取视频信息
    updateVideoTechInfo();
    
    // 检测编解码器
    detectCodec(src).then(codecInfo => {
      setTechInfo(prev => ({
        ...prev,
        codec: codecInfo
      }));
    });
    
    // 检测硬件加速
    const hwAccel = isHardwareAccelerated();
    setTechInfo(prev => ({ 
      ...prev, 
      hardwareAcceleration: hwAccel,
      renderMode: hwAccel ? "GPU 加速" : "软件渲染"
    }));
    
  }, [onCanPlay, src]);

  // 更新视频技术信息
  const updateVideoTechInfo = useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    
    // 获取视频宽高
    const width = videoElement.videoWidth;
    const height = videoElement.videoHeight;
    
    // 尝试获取更多技术信息
    try {
      // 尝试获取帧率信息
      let frameRate = "--";
      if ('requestVideoFrameCallback' in videoElement) {
        // 高级浏览器支持帧回调，可以用来计算帧率
        frameRate = "自动";
      }
      
      let bitrate = "--";
      
      // 计算估计比特率（如果播放时间大于0）
      if (videoElement.currentTime > 0) {
        // 安全地访问非标准属性，先转为unknown再转为扩展接口
        const extendedVideo = videoElement as unknown as ExtendedHTMLVideoElement;
        
        if (extendedVideo.webkitVideoDecodedByteCount) {
          const bitRateKbps = Math.round((extendedVideo.webkitVideoDecodedByteCount * 8) / videoElement.currentTime / 1000);
          bitrate = `${bitRateKbps} kbps`;
        }
      }
      
      // 尝试使用chrome媒体信息API (非标准)
      let dropFrames = 0;
      let performanceIndex = 100;
      
      // 安全地访问非标准方法，先转为unknown再转为扩展接口
      const extendedVideo = videoElement as unknown as ExtendedHTMLVideoElement;
      
      // 检查不同浏览器的API
      if (extendedVideo.getVideoPlaybackQuality) {
        const quality = extendedVideo.getVideoPlaybackQuality();
        
        if (quality) {
          dropFrames = quality.droppedVideoFrames || 0;
          const totalFrames = quality.totalVideoFrames || 0;
          performanceIndex = totalFrames > 0 ? Math.round((1 - dropFrames / totalFrames) * 100) : 100;
          
          // 尝试计算实际帧率
          if (videoElement.currentTime > 0 && totalFrames > 0) {
            const estimatedFps = Math.round(totalFrames / videoElement.currentTime);
            if (estimatedFps > 0) {
              frameRate = `${estimatedFps} fps`;
            }
          }
        }
      } else if (extendedVideo.mozParsedFrames && extendedVideo.mozDecodedFrames) {
        // Firefox特有API
        const mozParsed = extendedVideo.mozParsedFrames;
        const mozDecoded = extendedVideo.mozDecodedFrames;
        
        dropFrames = mozParsed - mozDecoded;
        performanceIndex = mozParsed ? Math.round((mozDecoded / mozParsed) * 100) : 100;
      } else if (extendedVideo.webkitDecodedFrameCount !== undefined && 
                extendedVideo.webkitDroppedFrameCount !== undefined) {
        // Webkit特有API
        const decodedFrames = extendedVideo.webkitDecodedFrameCount;
        const droppedWebkitFrames = extendedVideo.webkitDroppedFrameCount;
        
        dropFrames = droppedWebkitFrames || 0;
        const totalFrames = (decodedFrames || 0) + dropFrames;
        performanceIndex = totalFrames > 0 ? Math.round((1 - dropFrames / totalFrames) * 100) : 100;
      }
      
      // 更新技术信息状态
      setTechInfo(prev => ({
        ...prev,
        resolution: `${width}x${height}`,
        frameRate: frameRate,
        bitrate: bitrate,
        dropFrames: dropFrames,
        performanceIndex: performanceIndex,
      }));
    } catch (error) {
      console.error("获取视频技术信息失败:", error);
      // 至少保存分辨率信息
      setTechInfo((prev) => ({
        ...prev,
        resolution: `${width}x${height}`,
      }));
    }
  }, []);

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

    // 🚀 更新缓冲区范围信息
    if (videoElement.buffered.length > 0 && videoElement.duration > 0) {
      const ranges: {start: number, end: number}[] = [];
      for (let i = 0; i < videoElement.buffered.length; i++) {
        const start = (videoElement.buffered.start(i) / videoElement.duration) * 100;
        const end = (videoElement.buffered.end(i) / videoElement.duration) * 100;
        ranges.push({ start, end });
      }
      setBufferedRanges(ranges);
    }
    
    // 周期性更新技术信息
    updateVideoTechInfo();
  }, [onProgress, updateVideoTechInfo]);

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

    // 尝试设置最佳性能
    try {
      // 设置高性能提示
      const extendedVideo = videoElement as unknown as ExtendedHTMLVideoElement;
      if ('preservesPitch' in videoElement) {
        extendedVideo.preservesPitch = false;
      }
      
      // 添加允许高性能提示
      const videoEl = videoElement as HTMLElement;
      if (videoEl.style) {
        // 提示浏览器使用硬件加速
        videoEl.style.transform = 'translateZ(0)';
        videoEl.style.backfaceVisibility = 'hidden';
      }
    } catch (e) {
      console.warn("设置视频高性能模式失败", e);
    }

    // 事件监听器
    const events = [
      { name: "error", handler: handleError },
      { name: "loadstart", handler: handleLoadStart },
      { name: "canplay", handler: handleCanPlay },
      { name: "progress", handler: handleProgress },
      { name: "timeupdate", handler: updateVideoTechInfo }, // 添加时间更新时的技术信息更新
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
    updateVideoTechInfo,
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
      } else if (e.key === "ArrowLeft") {
        // 添加左键快退
        e.preventDefault();
        const currentTime = videoElement.currentTime;
        videoElement.currentTime = Math.max(currentTime - forwardSeconds, 0);
      } else if (e.key === " ") {
        // 空格键暂停/播放
        e.preventDefault();
        if (videoElement.paused) {
          videoElement.play();
        } else {
          videoElement.pause();
        }
      }
      
      // 切换技术信息显示 (按 I 键)
      if (e.key === "i" || e.key === "I") {
        toggleTechInfo();
      }
      
      // 切换缓冲信息显示 (按 B 键)
      if (e.key === "b" || e.key === "B") {
        setShowBufferInfo(prev => !prev);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [forwardSeconds, toggleTechInfo]);

  const openInExplorer = async () => {
    try {
      logWithTimestamp("video打开文件位置:", filepath);
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
        logWithTimestamp(message);
      }
    } catch (error) {
      errorWithTimestamp("打开文件位置出错:", error);
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
  
  // 视频技术信息显示
  const TechInfoDisplay = useMemo(() => {
    if (!showTechInfo) return null;
    
    return (
      <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white p-2 rounded text-xs z-10 font-mono">
        <div>分辨率: {techInfo.resolution}</div>
        <div>帧率: {techInfo.frameRate}</div>
        <div>编解码器: {techInfo.codec}</div>
        <div>比特率: {techInfo.bitrate}</div>
        <div>丢帧数: {techInfo.dropFrames}</div>
        <div>性能指数: {techInfo.performanceIndex}%</div>
        <div>硬件加速: {techInfo.hardwareAcceleration ? "已启用" : "未启用"}</div>
        <div>渲染模式: {techInfo.renderMode}</div>
        <div className="mt-1 text-gray-300 text-[10px]">按 I 键切换信息显示</div>
      </div>
    );
  }, [showTechInfo, techInfo]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 🚀 缓冲进度条显示组件
  const BufferDisplay = useMemo(() => {
    if (!showBufferInfo) return null;

    return (
      <div className="absolute bottom-16 left-4 right-4 bg-black bg-opacity-75 text-white p-3 rounded text-sm z-10">
        <div className="mb-2 font-bold">缓冲状态 (按 B 键切换)</div>
        
        {/* 可视化进度条 */}
        <div className="relative w-full h-2 bg-gray-600 rounded mb-2">
          {bufferedRanges.map((range, index) => (
            <div
              key={index}
              className="absolute h-full bg-blue-400 rounded"
              style={{
                left: `${range.start}%`,
                width: `${range.end - range.start}%`,
              }}
            />
          ))}
          {/* 当前播放位置指示器 */}
          {videoRef.current && videoRef.current.duration > 0 && (
            <div
              className="absolute top-0 w-0.5 h-full bg-red-500"
              style={{
                left: `${(videoRef.current.currentTime / videoRef.current.duration) * 100}%`,
              }}
            />
          )}
        </div>
        
        {/* 详细信息 */}
        <div className="text-xs space-y-1">
          <div>缓冲段数: {bufferedRanges.length}</div>
          {bufferedRanges.map((range, index) => (
            <div key={index} className="text-gray-300">
              段 {index + 1}: {range.start.toFixed(1)}% - {range.end.toFixed(1)}% 
              ({(range.end - range.start).toFixed(1)}% 已缓存)
            </div>
          ))}
          {videoRef.current && videoRef.current.duration > 0 && (
            <div className="text-yellow-300">
              当前位置: {((videoRef.current.currentTime / videoRef.current.duration) * 100).toFixed(1)}%
            </div>
          )}
        </div>
      </div>
    );
  }, [showBufferInfo, bufferedRanges]);

  return (
    <div className="relative w-full h-full group">
      <video
        preload="auto"
        ref={videoRef}
        src={src}
        poster={poster}
        controls={controls}
        autoPlay={autoPlay}
        muted={muted}
        className="w-full h-full bg-black object-contain"
        style={{ maxWidth: "100%", maxHeight: "100%" }}
        crossOrigin="anonymous"
        playsInline // 移动设备内联播放
        // 🚀 优化缓存设置
        
        // 增加缓冲区大小提示
        data-buffer-size="large"
      >
        您的浏览器不支持视频标签。
      </video>
      {filename && !isMobile && (
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
      {TechInfoDisplay}
      {BufferDisplay}
      {LoadingIndicator}
      {ErrorDisplay}
    </div>
  );
};

export default VideoPlayer;
