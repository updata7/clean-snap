import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from './i18n/LanguageContext';
import {
  IconDownload,
  IconX,
  IconPause,
  IconPlay,
  IconCamera,
  IconVideo,
  IconSettings,
  IconMic,
  IconVolume2,
  IconMonitor
} from './Icons';
import { useVideoRecorder, CameraConfig } from '../hooks/useVideoRecorder';

interface VideoRecorderProps {
  onClose: () => void;
}

// 简单的 Select 组件
const SimpleSelect = ({ value, onChange, options }: { value: string | number, onChange: (v: any) => void, options: { label: string, value: string | number }[] }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="bg-slate-700/50 text-white text-xs border border-white/10 rounded px-2 py-1 outline-none focus:border-blue-500/50"
  >
    {options.map(o => (
      <option key={o.value} value={o.value} className="bg-slate-800 text-white">
        {o.label}
      </option>
    ))}
  </select>
);

const VideoRecorder: React.FC<VideoRecorderProps> = ({ onClose }) => {
  const { t, language, setLanguage } = useLanguage();

  // Camera Config State (Sync with LocalStorage)
  // 注意：width 现在表示相对于容器宽度的百分比（0-100），而不是 vw
  const [cameraConfigState, setCameraConfigState] = useState<CameraConfig>(() => {
    const saved = localStorage.getItem('recorder_cameraConfig');
    return saved ? JSON.parse(saved) : {
      x: 80, y: 70, width: 20, shape: 'circle'  // width: 20 表示 20%
    };
  });

  // Export progress state
  const [exportProgress, setExportProgress] = useState(0);

  // Init Hook
  const {
    isRecording,
    isPaused,
    isExporting,
    exportProgress: hookExportProgress,
    recordingDuration,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    settings: {
      includeCamera, setIncludeCamera,
      includeMicrophone, setIncludeMicrophone,
      includeSystemAudio, setIncludeSystemAudio,
      saveFormat, setSaveFormat,
      targetFrameRate, setTargetFrameRate,
      cameraConfig, setCameraConfig
    },
    updateCameraConfigRef,
    streamRef,
    cameraStreamRef,
    originalVideoSize
  } = useVideoRecorder({
    initialCameraConfig: cameraConfigState,
    onClose,
    getTranslation: t,
    onExportProgress: (progress) => {
      setExportProgress(progress);
    }
  });

  // 同步 hook 的导出进度
  useEffect(() => {
    if (hookExportProgress !== undefined) {
      setExportProgress(hookExportProgress);
    }
  }, [hookExportProgress]);

  // 监听 Electron 的导出进度事件（双重监听确保收到）
  useEffect(() => {
    if (typeof window !== 'undefined' && 'electronAPI' in window && window.electronAPI.onExportProgress) {
      const handleProgress = (progress: number) => {
        console.log('[VideoRecorder] Export progress:', progress);
        setExportProgress(progress);
      };
      const cleanup = window.electronAPI.onExportProgress(handleProgress);
      return cleanup;
    }
  }, []);

  // Sync Camera Config to LocalStorage
  useEffect(() => {
    localStorage.setItem('recorder_cameraConfig', JSON.stringify(cameraConfig));
  }, [cameraConfig]);

  // Preview Streams (UI Only)
  const [screenPreviewStream, setScreenPreviewStream] = useState<MediaStream | null>(null);
  const [cameraPreviewStream, setCameraPreviewStream] = useState<MediaStream | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const cameraOverlayRef = useRef<HTMLVideoElement | null>(null);

  // Global Shortcut Ref Sync
  const isRecordingRef = useRef(isRecording);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  const handleStopRecordingRef = useRef(stopRecording);
  useEffect(() => { handleStopRecordingRef.current = stopRecording; }, [stopRecording]);

  // Global Shortcut Listener
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onGlobalShortcut) {
      const cleanup = window.electronAPI.onGlobalShortcut((command: string) => {
        if (command === 'toggle-recording') {
          if (isRecordingRef.current) {
            handleStopRecordingRef.current();
          }
        }
      });
      return cleanup;
    }
  }, []);

  // Keyboard shortcuts for camera zoom (only when camera is enabled and recording)
  useEffect(() => {
    if (!includeCamera || !isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if modifier keys are pressed (Cmd on Mac, Ctrl on Windows/Linux)
      const isModifierPressed = e.metaKey || e.ctrlKey;
      
      // Zoom in: Cmd/Ctrl + = or Cmd/Ctrl + +
      if (isModifierPressed && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        const newWidth = Math.min(50, cameraConfig.width + 2); // 每次增加2%（百分比）
        setCameraConfig({ ...cameraConfig, width: newWidth });
      }
      
      // Zoom out: Cmd/Ctrl + - or Cmd/Ctrl + _
      if (isModifierPressed && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        const newWidth = Math.max(5, cameraConfig.width - 2); // 每次减少2%（百分比）
        setCameraConfig({ ...cameraConfig, width: newWidth });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [includeCamera, isRecording, cameraConfig, setCameraConfig]);

  // Show Source Selector State
  const [showSourceSelector, setShowSourceSelector] = useState(false);
  const [availableSources, setAvailableSources] = useState<{ id: string; name: string; thumbnail: string; appIcon?: string | null }[]>([]);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  // 录制模式：全屏/窗口/区域（借鉴 Cap 的 Screen / Window / Region）
  const [recordMode, setRecordMode] = useState<'screen' | 'area' | 'window'>('screen');
  
  // 预览准备状态：选择区域/窗口后，进入预览模式，允许调整摄像头后再开始录制
  const [isPreviewReady, setIsPreviewReady] = useState(false);
  const [previewSourceId, setPreviewSourceId] = useState<string>('');
  const [previewRegion, setPreviewRegion] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasStreamRef = useRef<MediaStream | null>(null);
  const previewDisplayCanvasRef = useRef<HTMLCanvasElement | null>(null); // Windows 后备显示 canvas

  // Windows 后备方案：使用 Canvas 显示视频内容
  useEffect(() => {
    if (!isPreviewReady || isRecording) return;
    
    const video = previewVideoRef.current;
    const canvas = previewDisplayCanvasRef.current;
    
    if (!video || !canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let animationFrameId: number | null = null;
    
    const updateCanvasSize = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        console.log('[VideoRecorder] Canvas size updated:', { width: canvas.width, height: canvas.height });
      }
    };
    
    const drawFrame = () => {
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && !video.paused) {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          // 调试：检查是否真的绘制了内容
          const imageData = ctx.getImageData(0, 0, Math.min(10, canvas.width), Math.min(10, canvas.height));
          const pixels = imageData.data;
          let hasContent = false;
          for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i] > 10 || pixels[i + 1] > 10 || pixels[i + 2] > 10) {
              hasContent = true;
              break;
            }
          }
          if (hasContent && animationFrameId === null) {
            console.log('[VideoRecorder] Canvas is drawing content successfully');
          }
        } catch (e) {
          console.warn('[VideoRecorder] Canvas draw error:', e);
        }
      }
      if (!video.paused && !video.ended) {
        animationFrameId = requestAnimationFrame(drawFrame);
      }
    };
    
    const startDrawing = () => {
      console.log('[VideoRecorder] Starting canvas drawing');
      updateCanvasSize();
      drawFrame();
    };
    
    video.addEventListener('loadedmetadata', () => {
      console.log('[VideoRecorder] Video metadata loaded, updating canvas');
      updateCanvasSize();
    });
    video.addEventListener('play', () => {
      console.log('[VideoRecorder] Video play event, starting canvas drawing');
      startDrawing();
    });
    video.addEventListener('playing', () => {
      console.log('[VideoRecorder] Video playing event, starting canvas drawing');
      startDrawing();
    });
    
    // 如果视频已经在播放，立即开始绘制
    if (!video.paused && video.readyState >= 2) {
      console.log('[VideoRecorder] Video already playing, starting canvas drawing immediately');
      startDrawing();
    }
    
    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      video.removeEventListener('loadedmetadata', updateCanvasSize);
      video.removeEventListener('play', startDrawing);
      video.removeEventListener('playing', startDrawing);
    };
  }, [isPreviewReady, isRecording]);
  // 注意：previewVideoRef 已在上面定义，这里不再重复声明

  // Listen for area selection result from Electron（用于区域录制）
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onAreaSelectionResult) {
      const cleanup = window.electronAPI.onAreaSelectionResult(async (bounds) => {
        console.log('[VideoRecorder] ========== AREA SELECTION RESULT DEBUG ==========');
        console.log('[VideoRecorder] Received area selection result:', bounds);
        if (bounds) {
          console.log('[VideoRecorder] Entering preview mode for AREA recording');

          // Start recording with the selected area (Region 模式)
          // 等待选择器窗口完全关闭，避免录制到选择器 UI（虚线框、按钮等）
          // 主进程已经等待窗口关闭事件 + 300ms，这里再等待500ms确保渲染完全清理
          // 总共约800ms应该足够窗口完全从屏幕上消失
          await new Promise(resolve => setTimeout(resolve, 100));
          
          if (typeof window !== 'undefined' && 'electronAPI' in window) {
            try {
              // 1. 获取屏幕信息（包含 workArea，用于归一化）
              const screens = await window.electronAPI.getScreens();
              const primary = screens.find((s: any) => s.bounds?.x === 0 && s.bounds?.y === 0) || screens[0];

              if (!primary || !primary.workArea) {
                console.warn('[VideoRecorder] No primary screen or workArea, fallback to full screen recording');
                const sources = await window.electronAPI.getDesktopSources();
                const screenSource = sources.find((s: any) => s.id.startsWith('screen:0')) || sources[0];
                if (screenSource) {
                  startRecording(screenSource.id);
                }
                return;
              }

              // 重要：选择器窗口使用的是 workAreaSize（不包含 Dock/任务栏），但屏幕录制获取的是整个屏幕
              // 选择器窗口的坐标 bounds 是相对于 workArea 的，需要转换为相对于整个屏幕的坐标
              const screenBounds = primary.bounds || primary.workArea;
              const screenWidth = screenBounds.width || primary.workArea.width;
              const screenHeight = screenBounds.height || primary.workArea.height;
              const workAreaWidth = primary.workArea.width;
              const workAreaHeight = primary.workArea.height;
              
              // bounds 是相对于选择器窗口的坐标（选择器窗口大小 = workAreaSize）
              // 选择器窗口从 primaryDisplay.bounds.x/y 开始（通常是 0,0）
              // 所以 bounds 就是相对于 workArea 的坐标
              // 但屏幕录制获取的是整个屏幕，所以需要按比例转换
              // 注意：workArea 和整个屏幕的宽度通常相同，但高度可能不同（Dock/任务栏）
              const scaleX = screenWidth / workAreaWidth;
              const scaleY = screenHeight / workAreaHeight;
              
              // ========== 坐标转换分析 ==========
              // bounds 是从 AreaSelector 发送过来的坐标，已经排除了：
              // - 边框（4px）
              // - resize handles（1.5px）
              // 所以 bounds 已经是选择框内容区域的坐标（相对于 workArea）
              //
              // 转换步骤：
              // 1. 将 workArea 坐标转换为屏幕坐标（乘以 scaleX/scaleY）
              // 2. 归一化为 0-1 范围（除以 screenWidth/screenHeight）
              // 3. 裁剪时使用归一化坐标计算像素位置
              
              const screenX = bounds.x * scaleX;
              const screenY = bounds.y * scaleY;
              const screenW = bounds.width * scaleX;
              const screenH = bounds.height * scaleY;
              
              // 确保坐标不超出屏幕范围
              // 注意：bounds 已经排除了边框和 resize handles，所以这里的坐标已经是内容区域的坐标
              // 起点（左上角）：限制在屏幕范围内，但不要过度限制，避免影响精确的裁剪区域
              const finalX = Math.max(0, Math.min(screenWidth - 1, Math.round(screenX)));
              const finalY = Math.max(0, Math.min(screenHeight - 1, Math.round(screenY)));
              
              // 终点（右下角）：确保宽度和高度不超出屏幕边界
              // 使用 Math.round 确保坐标转换的精度，然后限制在合理范围内
              const roundedW = Math.round(screenW);
              const roundedH = Math.round(screenH);
              const finalW = Math.max(1, Math.min(screenWidth - finalX, roundedW));
              const finalH = Math.max(1, Math.min(screenHeight - finalY, roundedH));
              
              console.log('[VideoRecorder] 坐标转换详情:', {
                bounds,
                scale: { scaleX, scaleY },
                screen: { screenX, screenY, screenW, screenH },
                rounded: { roundedW, roundedH },
                final: { finalX, finalY, finalW, finalH }
              });
              
              // 归一化到 0-1 范围
              const normX = finalX / screenWidth;  // 起点 X（归一化）
              const normY = finalY / screenHeight; // 起点 Y（归一化）
              const normW = finalW / screenWidth;  // 宽度（归一化）
              const normH = finalH / screenHeight; // 高度（归一化）

              const normalizedRegion = { x: normX, y: normY, width: normW, height: normH };

              // 显示录制区域虚线框（使用转换后的屏幕坐标）
              if (window.electronAPI.showRecordingOverlay) {
                try {
                  const overlayBounds = {
                    x: finalX,
                    y: finalY,
                    width: finalW,
                    height: finalH
                  };
                  await window.electronAPI.showRecordingOverlay(overlayBounds);
                } catch (e) {
                  console.error('[VideoRecorder] Failed to show recording overlay:', e);
                  console.error('[VideoRecorder] Error details:', e);
                }
              } else {
                console.warn('[VideoRecorder] showRecordingOverlay API not available');
              }

              // 2. 选择主屏幕作为录制源（与区域选择器一致，借鉴 Cap 的 Region 录制）
              const sources = await window.electronAPI.getDesktopSources();
              console.log('[VideoRecorder] Got sources:', sources.length);
              const screenSource = sources.find((s: any) => s.id.startsWith('screen:0')) || sources[0];
              if (screenSource) {
                console.log('[VideoRecorder] Setting preview state:', {
                  sourceId: screenSource.id,
                  region: normalizedRegion
                });
                // 进入预览模式，而不是直接开始录制
                setPreviewSourceId(screenSource.id);
                setPreviewRegion(normalizedRegion);
                setIsPreviewReady(true);
                console.log('[VideoRecorder] Preview state set, isPreviewReady should be true');
                
                // 启动预览流（如果有区域，使用 Canvas 裁剪）
                try {
                  console.log('[VideoRecorder] Starting preview stream...');
                  const fullStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                      mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: screenSource.id
                      }
                    } as any,
                    audio: false
                  });
                  previewStreamRef.current = fullStream;
                  console.log('[VideoRecorder] Preview stream obtained:', {
                    active: fullStream.active,
                    videoTracks: fullStream.getVideoTracks().length
                  });
                  
                  // 如果有区域，使用 Canvas 裁剪预览
                  if (normalizedRegion && previewCanvasRef.current) {
                    console.log('[VideoRecorder] Setting up canvas crop preview...');
                    const canvas = previewCanvasRef.current;
                    const ctx = canvas.getContext('2d', { 
                      alpha: false,
                      desynchronized: true 
                    });
                    if (ctx) {
                      // 创建临时 video 元素来播放完整流
                      const tempVideo = document.createElement('video');
                      tempVideo.srcObject = fullStream;
                      tempVideo.autoplay = true;
                      tempVideo.muted = true;
                      tempVideo.playsInline = true;
                      
                      // 等待视频元数据加载
                      await new Promise<void>((resolve) => {
                        if (tempVideo.readyState >= 2) {
                          resolve();
                        } else {
                          tempVideo.addEventListener('loadedmetadata', () => resolve(), { once: true });
                        }
                      });
                      
                      await tempVideo.play();
                      
                      const videoWidth = tempVideo.videoWidth;
                      const videoHeight = tempVideo.videoHeight;
                      
                      // ========== 预览 Canvas 裁剪计算 ==========
                      // 将归一化坐标转换为像素坐标
                      // 起点（左上角）：使用 Math.floor 向下取整，确保不包含边界外的像素
                      const cropX = Math.max(0, Math.min(videoWidth - 1, Math.floor(normalizedRegion.x * videoWidth)));
                      const cropY = Math.max(0, Math.min(videoHeight - 1, Math.floor(normalizedRegion.y * videoHeight)));
                      
                      // 终点（右下角）：计算宽度和高度
                      // 使用 Math.floor 确保不超出选择区域（避免包含边界外的像素）
                      // 注意：这里使用 Math.floor 而不是 Math.ceil，确保裁剪区域完全在选择区域内
                      const rawCropWidth = normalizedRegion.width * videoWidth;
                      const rawCropHeight = normalizedRegion.height * videoHeight;
                      const cropWidth = Math.max(1, Math.min(videoWidth - cropX, Math.floor(rawCropWidth)));
                      const cropHeight = Math.max(1, Math.min(videoHeight - cropY, Math.floor(rawCropHeight)));
                      
                      // 设置 Canvas 尺寸为裁剪区域尺寸
                      canvas.width = cropWidth;
                      canvas.height = cropHeight;
                      
                      // 创建裁剪后的流
                      const canvasStream = canvas.captureStream(30);
                      previewCanvasStreamRef.current = canvasStream;
                      
                      // 绘制循环
                      let animationFrameId: number;
                      const drawFrame = () => {
                        if (tempVideo.readyState >= 2 && tempVideo.videoWidth > 0 && tempVideo.videoHeight > 0) {
                          ctx.drawImage(
                            tempVideo,
                            cropX, cropY, cropWidth, cropHeight,  // 源区域
                            0, 0, cropWidth, cropHeight            // 目标区域
                          );
                        }
                        animationFrameId = requestAnimationFrame(drawFrame);
                      };
                      drawFrame();
                      
                      // 保存清理函数
                      (canvas as any)._cleanup = () => {
                        if (animationFrameId) {
                          cancelAnimationFrame(animationFrameId);
                        }
                        tempVideo.srcObject = null;
                        tempVideo.remove();
                      };
                      
                      // 绑定裁剪后的流到预览视频
                      if (previewVideoRef.current) {
                        console.log('[VideoRecorder] Binding canvas stream to preview video');
                        previewVideoRef.current.srcObject = canvasStream;
                        previewVideoRef.current.play()
                          .then(() => console.log('[VideoRecorder] Canvas preview video started playing'))
                          .catch((err) => console.error('[VideoRecorder] Failed to play canvas preview:', err));
                      } else {
                        console.warn('[VideoRecorder] previewVideoRef.current is null, cannot bind canvas stream');
                      }
                    }
                  } else {
                    // 没有区域，直接使用完整流
                    console.log('[VideoRecorder] No region, using full stream directly');
                    if (previewVideoRef.current) {
                      console.log('[VideoRecorder] Binding full stream to preview video');
                      previewVideoRef.current.srcObject = fullStream;
                      previewVideoRef.current.play()
                        .then(() => console.log('[VideoRecorder] Full preview video started playing'))
                        .catch((err) => console.error('[VideoRecorder] Failed to play full preview:', err));
                    } else {
                      console.warn('[VideoRecorder] previewVideoRef.current is null, cannot bind full stream');
                    }
                  }
                } catch (e) {
                  console.error('[VideoRecorder] Failed to start preview stream:', e);
                }
              } else {
                console.error('[VideoRecorder] No screen source found!');
              }
            } catch (e) {
              console.error('[VideoRecorder] Failed to start area recording:', e);
            }
            console.log('[VideoRecorder] ========== END AREA SELECTION RESULT DEBUG ==========');
          }
        } else {
          console.log('[VideoRecorder] Area selection cancelled');
        }
      });
      return cleanup;
    } else {
      console.warn('[VideoRecorder] electronAPI.onAreaSelectionResult not available');
    }
  }, [startRecording, setIsPreviewReady, setPreviewSourceId, setPreviewRegion]);

  // Fetch Sources
  const fetchSources = async () => {
    console.log('[VideoRecorder] ========== FETCH SOURCES DEBUG ==========');
    if (typeof window !== 'undefined' && 'electronAPI' in window) {
      try {
        console.log('[VideoRecorder] Calling getDesktopSources...');
        const sources = await window.electronAPI.getDesktopSources();
        console.log('[VideoRecorder] Got sources:', sources.length);
        console.log('[VideoRecorder] Sources:', sources.map((s: any) => ({ id: s.id, name: s.name })));
        setAvailableSources(sources);
        console.log('[VideoRecorder] Available sources state updated');
      } catch (e) { 
        console.error('[VideoRecorder] Failed to fetch sources:', e);
      }
    } else {
      console.warn('[VideoRecorder] electronAPI not available');
    }
    console.log('[VideoRecorder] ========== END FETCH SOURCES DEBUG ==========');
  };

  const handleStartRequest = async () => {
    if (typeof window !== 'undefined' && 'electronAPI' in window) {
      if (recordMode === 'area' && window.electronAPI.createAreaSelector) {
        console.log('[VideoRecorder] handleStartRequest: AREA mode, create selector WITHOUT minimizing main window');
        // 区域录制：不再最小化主窗口，只在其上方弹出全屏透明区域选择器
        console.log('[VideoRecorder] Calling electronAPI.createAreaSelector()');
        window.electronAPI.createAreaSelector();
      } else {
        // 默认：选择屏幕或窗口源
        console.log('[VideoRecorder] handleStartRequest: SCREEN/WINDOW mode, fetching sources');
        await fetchSources();
        console.log('[VideoRecorder] Setting showSourceSelector to true');
        setShowSourceSelector(true);
        console.log('[VideoRecorder] showSourceSelector should be true now');
      }
    } else {
      startRecording('');
    }
  };

  const handleSourceSelect = async (sourceId: string) => {
    console.log('[VideoRecorder] ========== SOURCE SELECT DEBUG ==========');
    console.log('[VideoRecorder] Source ID:', sourceId);
    setShowSourceSelector(false);
    console.log('[VideoRecorder] Source selector closed');
    // 进入预览模式，而不是直接开始录制
    setPreviewSourceId(sourceId);
    setPreviewRegion(null);
    setIsPreviewReady(true);
    console.log('[VideoRecorder] Preview state set:', { sourceId, isPreviewReady: true });
    
    // 启动预览流
    try {
      console.log('[VideoRecorder] Starting preview stream for source:', sourceId);
      
      // Windows 特定：检查平台
      const platform = (window as any).electronAPI?.platform;
      const isWindows = platform === 'win32';
      
      console.log('[VideoRecorder] Platform:', platform, 'isWindows:', isWindows);
      
      // Windows 上可能需要额外的参数
      const videoConstraints: any = {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId
        }
      };
      
      // Windows 特定：添加帧率限制，避免性能问题
      if (isWindows) {
        videoConstraints.mandatory.minFrameRate = 15;
        videoConstraints.mandatory.maxFrameRate = 30;
        videoConstraints.mandatory.maxWidth = 1920;
        videoConstraints.mandatory.maxHeight = 1080;
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });
      previewStreamRef.current = stream;
      console.log('[VideoRecorder] Preview stream obtained:', {
        active: stream.active,
        videoTracks: stream.getVideoTracks().length
      });
      if (previewVideoRef.current) {
        console.log('[VideoRecorder] Binding preview stream to video element');
        console.log('[VideoRecorder] Stream tracks:', stream.getTracks().map(t => ({
          kind: t.kind,
          enabled: t.enabled,
          readyState: t.readyState,
          settings: t.getSettings ? t.getSettings() : null
        })));
        
        // Windows 特定：确保视频元素可见
        const videoEl = previewVideoRef.current;
        videoEl.srcObject = stream;
        
        // Windows 特定：强制显示视频元素
        videoEl.style.display = 'block';
        videoEl.style.visibility = 'visible';
        videoEl.style.opacity = '1';
        
        // 等待元数据加载后再播放（Windows 上可能需要）
        const playVideo = () => {
          videoEl.play()
            .then(() => {
              console.log('[VideoRecorder] Preview video started playing');
              console.log('[VideoRecorder] Video element state:', {
                videoWidth: videoEl.videoWidth,
                videoHeight: videoEl.videoHeight,
                readyState: videoEl.readyState,
                paused: videoEl.paused,
                currentTime: videoEl.currentTime
              });
            })
            .catch((err) => {
              console.error('[VideoRecorder] Failed to play preview video:', err);
              // Windows 特定：如果自动播放失败，尝试手动播放
              setTimeout(() => {
                videoEl.play().catch(e => console.error('[VideoRecorder] Retry play failed:', e));
              }, 100);
            });
        };
        
        if (videoEl.readyState >= 2) {
          // 元数据已加载
          playVideo();
        } else {
          // 等待元数据加载
          videoEl.addEventListener('loadedmetadata', playVideo, { once: true });
        }
      } else {
        console.warn('[VideoRecorder] previewVideoRef.current is null, cannot bind stream');
      }
      console.log('[VideoRecorder] ========== END SOURCE SELECT DEBUG ==========');
    } catch (e) {
      console.error('[VideoRecorder] Failed to start preview stream:', e);
      console.log('[VideoRecorder] ========== END SOURCE SELECT DEBUG (ERROR) ==========');
    }
  };
  
  // 从预览模式开始录制（使用 useCallback 优化性能）
  const handleStartFromPreview = React.useCallback(() => {
    console.log('[VideoRecorder] ========== START FROM PREVIEW ==========');
    console.log('[VideoRecorder] previewSourceId:', previewSourceId);
    console.log('[VideoRecorder] previewRegion:', previewRegion);
    
    if (previewSourceId) {
      // 清理预览流
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach(track => track.stop());
        previewStreamRef.current = null;
      }
      if (previewCanvasStreamRef.current) {
        previewCanvasStreamRef.current.getTracks().forEach(track => track.stop());
        previewCanvasStreamRef.current = null;
      }
      // 清理 Canvas 绘制循环
      if (previewCanvasRef.current && (previewCanvasRef.current as any)._cleanup) {
        (previewCanvasRef.current as any)._cleanup();
      }
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = null;
      }
      
      // 开始录制
      console.log('[VideoRecorder] Calling startRecording...');
      if (previewRegion) {
        startRecording(previewSourceId, previewRegion);
      } else {
        startRecording(previewSourceId);
      }
      console.log('[VideoRecorder] startRecording called');
      
      // 退出预览模式
      setIsPreviewReady(false);
      setPreviewSourceId('');
      setPreviewRegion(null);
      console.log('[VideoRecorder] ========== END START FROM PREVIEW ==========');
    } else {
      console.warn('[VideoRecorder] No previewSourceId, cannot start recording');
    }
  }, [previewSourceId, previewRegion, startRecording]);
  
  // 取消预览模式（使用 useCallback 优化性能）
  const handleCancelPreview = React.useCallback(() => {
    // 清理预览流
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach(track => track.stop());
      previewStreamRef.current = null;
    }
    if (previewCanvasStreamRef.current) {
      previewCanvasStreamRef.current.getTracks().forEach(track => track.stop());
      previewCanvasStreamRef.current = null;
    }
    // 清理 Canvas 绘制循环
    if (previewCanvasRef.current && (previewCanvasRef.current as any)._cleanup) {
      (previewCanvasRef.current as any)._cleanup();
    }
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
    
    // 隐藏录制区域虚线框
    if (window.electronAPI?.hideRecordingOverlay) {
      window.electronAPI.hideRecordingOverlay();
    }
    
    setIsPreviewReady(false);
    setPreviewSourceId('');
    setPreviewRegion(null);
  }, []);
  
  // 清理预览流
  useEffect(() => {
    return () => {
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach(track => track.stop());
        previewStreamRef.current = null;
      }
      if (previewCanvasStreamRef.current) {
        previewCanvasStreamRef.current.getTracks().forEach(track => track.stop());
        previewCanvasStreamRef.current = null;
      }
      // 清理 Canvas 绘制循环
      if (previewCanvasRef.current && (previewCanvasRef.current as any)._cleanup) {
        (previewCanvasRef.current as any)._cleanup();
      }
    };
  }, []);

  // Camera Preview Loader
  useEffect(() => {
    if (includeCamera && !cameraPreviewStream) {
      navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false })
        .then(setCameraPreviewStream)
        .catch(e => console.warn("Preview Cam Fail", e));
    } else if (!includeCamera && cameraPreviewStream) {
      // Do not close tracks if recording is active? 
      // Hook handles recording streams. This is just preview.
      // If we stop preview here, does it affect hook?
      // If hook cloned it, no. 
      // If hook reused it? Hook handles its own stream management.
      // But hook might share same physical device.
      // Let's safe-close only if NOT recording.
      if (!isRecording) {
        cameraPreviewStream.getTracks().forEach(t => t.stop());
      }
      setCameraPreviewStream(null);
    }
  }, [includeCamera, isRecording]);

  // Screen Preview Loader
  useEffect(() => {
    if (!isRecording && !screenPreviewStream) {
      const load = async () => {
        if (window.electronAPI) {
          try {
            const sources = await window.electronAPI.getDesktopSources();
            const src = sources.find((s: any) => s.id.startsWith('screen:0')) || sources[0];
            if (src) {
              const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                  // @ts-ignore
                  mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: src.id, maxWidth: 1920, maxHeight: 1080 }
                } as any
              });
              setScreenPreviewStream(stream);
            }
          } catch (e) { console.warn("Screen preview failed", e); }
        }
      };
      load();
    }
  }, [isRecording, screenPreviewStream]);

  // Stop screen preview stream as soon as正式录制开始，避免双路解码导致卡顿
  useEffect(() => {
    if (isRecording && screenPreviewStream) {
      screenPreviewStream.getTracks().forEach(t => t.stop());
      setScreenPreviewStream(null);
    }
  }, [isRecording, screenPreviewStream]);

  // Bind Preview Video
  useEffect(() => {
    if (previewVideoRef.current && screenPreviewStream) {
      previewVideoRef.current.srcObject = screenPreviewStream;
    }
  }, [screenPreviewStream]);

  // Cleanup Preview Streams on Unmount
  useEffect(() => {
    return () => {
      if (screenPreviewStream) {
        screenPreviewStream.getTracks().forEach(t => t.stop());
      }
      if (cameraPreviewStream) {
        cameraPreviewStream.getTracks().forEach(t => t.stop());
      }
      // 注意：不在 cleanup 中隐藏 overlay，因为当 isRecording 变为 true 时，
      // setScreenPreviewStream(null) 会触发这个 cleanup，导致 overlay 被意外隐藏
      // overlay 的隐藏应该在组件真正卸载时或停止录制时进行
    };
  }, [screenPreviewStream, cameraPreviewStream]);

  // 组件卸载时隐藏录制区域虚线框
  useEffect(() => {
    return () => {
      // 只在组件真正卸载时隐藏 overlay
      if (window.electronAPI && window.electronAPI.hideRecordingOverlay) {
        try {
          console.log('[VideoRecorder] Component unmounting, hiding recording overlay');
          window.electronAPI.hideRecordingOverlay();
        } catch (e) {
          console.warn('[VideoRecorder] Failed to hide recording overlay on unmount:', e);
        }
      }
    };
  }, []); // 空依赖数组，只在组件卸载时执行

  // Bind Camera Overlay (使用录制流或预览流)
  useEffect(() => {
    if (cameraOverlayRef.current) {
      // 录制时优先使用录制流，否则使用预览流
      const streamToUse = (isRecording && cameraStreamRef?.current) ? cameraStreamRef.current : cameraPreviewStream;
      console.log('[VideoRecorder] ========== CAMERA OVERLAY BIND DEBUG ==========');
      console.log('[VideoRecorder] Camera overlay ref exists:', !!cameraOverlayRef.current);
      console.log('[VideoRecorder] Is recording:', isRecording);
      console.log('[VideoRecorder] Camera stream ref:', !!cameraStreamRef?.current);
      console.log('[VideoRecorder] Camera preview stream:', !!cameraPreviewStream);
      console.log('[VideoRecorder] Stream to use:', !!streamToUse);
      if (streamToUse) {
        console.log('[VideoRecorder] Binding stream to camera overlay');
        cameraOverlayRef.current.srcObject = streamToUse;
        cameraOverlayRef.current.play().then(() => {
          console.log('[VideoRecorder] Camera overlay video started playing');
        }).catch(e => {
          console.error('[VideoRecorder] Failed to play camera overlay video:', e);
        });
      } else {
        console.warn('[VideoRecorder] No camera stream available to bind');
        if (cameraOverlayRef.current.srcObject) {
          cameraOverlayRef.current.srcObject = null;
        }
      }
      console.log('[VideoRecorder] ========== END CAMERA OVERLAY BIND DEBUG ==========');
    }
  }, [cameraPreviewStream, isRecording, cameraStreamRef]);

  // Format Duration
  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Drag Logic (Simplified for brevity - can be extracted to hook too)
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const virtualConfigRef = useRef(cameraConfig);
  
  // Edge resize state
  const edgeResizeRef = useRef<'none' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'>('none');
  // 使用相对阈值（窗口大小的20%）和最小阈值（25px），让边缘更容易触发
  const getEdgeThreshold = (width: number, height: number): number => {
    const relativeThreshold = Math.min(width, height) * 0.20; // 窗口大小的20%，增加边缘区域
    return Math.max(25, relativeThreshold); // 至少25px
  };

  // Update virtual config when real config changes (e.g. from settings menu)
  useEffect(() => {
    if (!isDraggingRef.current && !isResizingRef.current) {
      virtualConfigRef.current = cameraConfig;
    }
  }, [cameraConfig]);

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    
    // Check if starting from edge
    if (!('touches' in e)) {
      const edge = detectEdge(e as React.MouseEvent);
      if (edge !== 'none') {
        edgeResizeRef.current = edge;
        isResizingRef.current = true;
        virtualConfigRef.current = cameraConfig;
        dragStartRef.current = { x: clientX, y: clientY };
        // 读取当前 DOM 样式作为初始值（不设置，因为 DOM 应该已经有正确的值）
        if (cameraOverlayRef.current?.parentElement) {
          const el = cameraOverlayRef.current.parentElement;
          const currentStyle = {
            left: window.getComputedStyle(el).left,
            top: window.getComputedStyle(el).top,
            width: window.getComputedStyle(el).width
          };
        }
        return;
      }
    }
    
    isDraggingRef.current = true;
    virtualConfigRef.current = cameraConfig; // 同步初始状态
    dragStartRef.current = { x: clientX, y: clientY };
    // 读取当前 DOM 样式作为初始值（不设置，因为 DOM 应该已经有正确的值）
    if (cameraOverlayRef.current?.parentElement) {
      const el = cameraOverlayRef.current.parentElement;
      const currentStyle = {
        left: window.getComputedStyle(el).left,
        top: window.getComputedStyle(el).top,
        width: window.getComputedStyle(el).width
      };
    }
  };

  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    isResizingRef.current = true;
    virtualConfigRef.current = cameraConfig; // Sync start state
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    dragStartRef.current = { x: clientX, y: clientY };
    // 读取当前 DOM 样式作为初始值（不设置，因为 DOM 应该已经有正确的值）
    if (cameraOverlayRef.current?.parentElement) {
      const el = cameraOverlayRef.current.parentElement;
      const currentStyle = {
        left: window.getComputedStyle(el).left,
        top: window.getComputedStyle(el).top,
        width: window.getComputedStyle(el).width
      };
    }
  };

  // Detect which edge the mouse is on
  const detectEdge = (e: React.MouseEvent): 'none' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' => {
    if (!cameraOverlayRef.current?.parentElement) return 'none';
    
    const rect = cameraOverlayRef.current.parentElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;
    
    // 使用相对阈值，让边缘检测更智能
    // 增加边缘检测区域，让左侧边缘更容易触发（因为可能有按钮干扰）
    const baseThreshold = getEdgeThreshold(width, height);
    // 左侧边缘使用更大的阈值，因为左侧可能有按钮等UI元素干扰
    const leftThreshold = baseThreshold * 1.5;  // 左侧边缘检测区域增加50%
    const edgeThreshold = baseThreshold;
    
    const isTop = y < edgeThreshold;
    const isBottom = y > height - edgeThreshold;
    const isLeft = x < leftThreshold;  // 使用更大的左侧阈值
    const isRight = x > width - edgeThreshold;
    
    const edge = (() => {
      if (isTop && isLeft) return 'top-left';
      if (isTop && isRight) return 'top-right';
      if (isBottom && isLeft) return 'bottom-left';
      if (isBottom && isRight) return 'bottom-right';
      if (isTop) return 'top';
      if (isBottom) return 'bottom';
      if (isLeft) return 'left';
      if (isRight) return 'right';
      return 'none';
    })();
    
    // 边缘检测（不输出日志，减少噪音）
    
    return edge;
  };

  // Get cursor style based on edge
  const getEdgeCursor = (edge: string): string => {
    switch (edge) {
      case 'top-left':
      case 'bottom-right':
        return 'nwse-resize';
      case 'top-right':
      case 'bottom-left':
        return 'nesw-resize';
      case 'top':
      case 'bottom':
        return 'ns-resize';
      case 'left':
      case 'right':
        return 'ew-resize';
      default:
        return 'move';
    }
  };

  const handleDragMove = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    if (!cameraOverlayRef.current) return;

    // Handle edge resize
    if (isResizingRef.current && edgeResizeRef.current !== 'none') {
      const dx = clientX - dragStartRef.current.x;
      const dy = clientY - dragStartRef.current.y;
      
      // Calculate size change based on edge
      const edge = edgeResizeRef.current;
      
      // 计算缩放方向：向外拖动（远离中心）= 放大，向内拖动（靠近中心）= 缩小
      // 统一规则：向外拖动时deltaSize为正（放大），向内拖动时deltaSize为负（缩小）
      let deltaSize = 0;
      
      if (edge === 'top-left') {
        // 向左上拖动（dx和dy都是负）= 向外 = 放大，所以deltaSize应该是正的
        deltaSize = Math.abs(dx) > Math.abs(dy) ? -dx : -dy;
      } else if (edge === 'top-right') {
        // 向右上拖动（dx正，dy负）= 向外 = 放大
        deltaSize = Math.abs(dx) > Math.abs(dy) ? dx : -dy;
      } else if (edge === 'bottom-left') {
        // 向左下拖动（dx负，dy正）= 向外 = 放大
        deltaSize = Math.abs(dx) > Math.abs(dy) ? -dx : dy;
      } else if (edge === 'bottom-right') {
        // 向右下拖动（dx和dy都是正）= 向外 = 放大
        deltaSize = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      } else if (edge === 'left') {
        // 向左拖动（dx负）= 向外 = 放大，所以deltaSize应该是正的
        deltaSize = -dx;
      } else if (edge === 'right') {
        // 向右拖动（dx正）= 向外 = 放大
        deltaSize = dx;
      } else if (edge === 'top') {
        // 向上拖动（dy负）= 向外 = 放大，所以deltaSize应该是正的
        deltaSize = -dy;
      } else if (edge === 'bottom') {
        // 向下拖动（dy正）= 向外 = 放大
        deltaSize = dy;
      }
      
      // 更直观的缩放计算：直接基于拖动距离和容器尺寸
      // 关键：使用容器尺寸计算灵敏度（与"刚打开摄像头"时的逻辑一致）
      // 这样拖动时的像素变化直接对应容器中的显示变化，更直观
      
      // 获取容器尺寸（用于计算灵敏度，与"刚打开摄像头"时一致）
      const overlayElementForSensitivity = cameraOverlayRef.current?.parentElement;
      const containerForSensitivity = overlayElementForSensitivity?.parentElement;
      const containerWidthForSensitivity = containerForSensitivity?.clientWidth || window.innerWidth;
      const containerHeightForSensitivity = containerForSensitivity?.clientHeight || window.innerHeight;
      const containerSizeForSensitivity = Math.min(containerWidthForSensitivity, containerHeightForSensitivity);
      
      // 获取视频尺寸（用于将容器中的百分比变化转换为相对于原始视频的百分比变化）
      // 关键：录制模式下使用 originalVideoSize，与渲染逻辑一致
      let videoWidth = 0, videoHeight = 0;
      if (isPreviewReady && previewVideoRef.current && previewVideoRef.current.videoWidth > 0) {
        videoWidth = previewVideoRef.current.videoWidth;
        videoHeight = previewVideoRef.current.videoHeight;
      } else if (isRecording && originalVideoSize) {
        // 录制模式：使用 originalVideoSize，与渲染逻辑一致
        videoWidth = originalVideoSize.width;
        videoHeight = originalVideoSize.height;
      } else if (isRecording && recordingPreviewRef.current && recordingPreviewRef.current.videoWidth > 0) {
        // 回退：如果 originalVideoSize 不可用，使用 recordingPreviewRef
        videoWidth = recordingPreviewRef.current.videoWidth;
        videoHeight = recordingPreviewRef.current.videoHeight;
      }
      
      // 计算灵敏度：基于容器尺寸（与"刚打开摄像头"时一致）
      // 使用 200 / containerSize，这样拖动 10 像素大约改变 2-3% 的宽度（对于 600-1000 的 containerSize）
      const pixelToPercentRatioForContainer = 200 / containerSizeForSensitivity;
      
      // 计算相对于容器的百分比变化
      const deltaPercentInContainer = deltaSize * pixelToPercentRatioForContainer;
      
      // 转换为相对于原始视频的百分比变化
      // 关键：需要将容器中的百分比变化转换为相对于原始视频的百分比变化
      // 如果视频在容器中的缩放比例是 scale = containerSize / videoMinSize
      // 那么容器中的 1% 变化对应视频中的 (1 / scale) % 变化
      const videoMinSize = videoWidth > 0 && videoHeight > 0 ? Math.min(videoWidth, videoHeight) : containerSizeForSensitivity;
      const scaleToContainer = containerSizeForSensitivity > 0 && videoMinSize > 0 
        ? containerSizeForSensitivity / videoMinSize 
        : 1;
      
      // 容器中的百分比变化 -> 转换为相对于原始视频的百分比变化
      // deltaPercent = deltaPercentInContainer / scaleToContainer
      const deltaPercent = scaleToContainer > 0 ? deltaPercentInContainer / scaleToContainer : deltaPercentInContainer;
      
      const oldWidth = virtualConfigRef.current.width;
      const newWidth = Math.max(5, Math.min(100, oldWidth + deltaPercent)); // 提高上限到100% // 限制在5%-50%之间

      // Update Virtual Ref
      virtualConfigRef.current = { ...virtualConfigRef.current, width: newWidth };

      // Direct DOM update：需要与渲染时的计算逻辑一致
      // 渲染时：camSizePixels = (videoMinSize * width) / 100, camSizeDisplay = camSizePixels * scale, camSizePercent = (camSizeDisplay / containerWidth) * 100
      // 所以拖动时也需要计算相对于容器的百分比，而不是直接使用 newWidth
      const overlayElement = cameraOverlayRef.current?.parentElement;
      if (overlayElement) {
        // 获取视频和容器尺寸（与渲染逻辑一致）
        // 关键：录制模式下使用 originalVideoSize，与渲染逻辑一致
        let videoWidth = 0, videoHeight = 0;
        let containerElement: HTMLElement | null = null;
        
        if (isPreviewReady && previewVideoRef.current && previewVideoRef.current.videoWidth > 0) {
          videoWidth = previewVideoRef.current.videoWidth;
          videoHeight = previewVideoRef.current.videoHeight;
          containerElement = previewVideoRef.current.parentElement;
        } else if (isRecording && originalVideoSize) {
          // 录制模式：使用 originalVideoSize，与渲染逻辑一致
          videoWidth = originalVideoSize.width;
          videoHeight = originalVideoSize.height;
          containerElement = recordingPreviewRef.current?.parentElement || overlayElement.parentElement;
        } else if (isRecording && recordingPreviewRef.current && recordingPreviewRef.current.videoWidth > 0) {
          // 回退：如果 originalVideoSize 不可用，使用 recordingPreviewRef
          videoWidth = recordingPreviewRef.current.videoWidth;
          videoHeight = recordingPreviewRef.current.videoHeight;
          containerElement = recordingPreviewRef.current.parentElement;
        } else {
          containerElement = overlayElement.parentElement;
        }
        
        const containerWidth = containerElement?.clientWidth || 1;
        const containerHeight = containerElement?.clientHeight || 1;
        const videoMinSize = videoWidth > 0 && videoHeight > 0 ? Math.min(videoWidth, videoHeight) : 0;
        
        // 计算 scale（与渲染逻辑一致）
        const scaleX = videoWidth > 0 ? containerWidth / videoWidth : 1;
        const scaleY = videoHeight > 0 ? containerHeight / videoHeight : 1;
        const scale = Math.min(scaleX, scaleY);
        
        // 计算相对于容器的百分比（与渲染逻辑一致）
        const camSizePixels = videoMinSize > 0 ? (videoMinSize * newWidth) / 100 : 0;
        const camSizeDisplay = camSizePixels * scale;
        const camSizePercent = containerWidth > 0 && camSizeDisplay > 0
          ? (camSizeDisplay / containerWidth) * 100
          : newWidth;
        
        // 确保直接修改 DOM，避免 React 重新渲染覆盖
        overlayElement.style.width = `${camSizePercent}%`; // 使用计算后的百分比
        overlayElement.style.aspectRatio = '1 / 1';
        overlayElement.style.height = '';
      }

      // 同步到 Hook Ref（用于录制时 Canvas 绘制），但不更新 React 状态（避免频繁重新渲染）
      updateCameraConfigRef({ width: newWidth });

      // Update Drag Start for incremental resize
      dragStartRef.current = { x: clientX, y: clientY };
      return;
    }

    // Handle corner resize handle (existing functionality)
    if (isResizingRef.current) {
      const dx = clientX - dragStartRef.current.x;
      // 使用与边缘拖动相同的缩放逻辑，保持一致性
      
      // 获取容器尺寸（用于计算灵敏度）
      const overlayElement = cameraOverlayRef.current.parentElement!;
      const containerForSensitivity = overlayElement?.parentElement;
      const containerWidthForSensitivity = containerForSensitivity?.clientWidth || window.innerWidth;
      const containerHeightForSensitivity = containerForSensitivity?.clientHeight || window.innerHeight;
      const containerSizeForSensitivity = Math.min(containerWidthForSensitivity, containerHeightForSensitivity);
      
      // 获取视频尺寸（用于将容器中的百分比变化转换为相对于原始视频的百分比变化）
      // 关键：录制模式下使用 originalVideoSize，与渲染逻辑一致
      let videoWidth = 0, videoHeight = 0;
      if (isPreviewReady && previewVideoRef.current && previewVideoRef.current.videoWidth > 0) {
        videoWidth = previewVideoRef.current.videoWidth;
        videoHeight = previewVideoRef.current.videoHeight;
      } else if (isRecording && originalVideoSize) {
        // 录制模式：使用 originalVideoSize，与渲染逻辑一致
        videoWidth = originalVideoSize.width;
        videoHeight = originalVideoSize.height;
      } else if (isRecording && recordingPreviewRef.current && recordingPreviewRef.current.videoWidth > 0) {
        // 回退：如果 originalVideoSize 不可用，使用 recordingPreviewRef
        videoWidth = recordingPreviewRef.current.videoWidth;
        videoHeight = recordingPreviewRef.current.videoHeight;
      }
      
      // 计算灵敏度：基于容器尺寸（与边缘缩放一致）
      const pixelToPercentRatioForContainer = 200 / containerSizeForSensitivity;
      
      // 计算相对于容器的百分比变化
      const deltaPercentInContainer = dx * pixelToPercentRatioForContainer;
      
      // 转换为相对于原始视频的百分比变化
      const videoMinSizeForSensitivity = videoWidth > 0 && videoHeight > 0 ? Math.min(videoWidth, videoHeight) : containerSizeForSensitivity;
      const scaleToContainer = containerSizeForSensitivity > 0 && videoMinSizeForSensitivity > 0 
        ? containerSizeForSensitivity / videoMinSizeForSensitivity 
        : 1;
      const deltaPercent = deltaPercentInContainer / scaleToContainer;
      
      const oldWidth = virtualConfigRef.current.width;
      const newWidth = Math.max(5, Math.min(100, oldWidth + deltaPercent)); // 提高上限到100%
      

      virtualConfigRef.current = { ...virtualConfigRef.current, width: newWidth };
      
      // Direct DOM update：需要与渲染时的计算逻辑一致
      // 关键：录制模式下使用 originalVideoSize，与渲染逻辑一致
      // 重用之前获取的 overlayElement，但需要重新获取 videoWidth/videoHeight（因为可能使用了 originalVideoSize）
      let containerElement: HTMLElement | null = null;
      let videoWidthForDOM = videoWidth;
      let videoHeightForDOM = videoHeight;
      
      if (isPreviewReady && previewVideoRef.current && previewVideoRef.current.videoWidth > 0) {
        containerElement = previewVideoRef.current.parentElement;
        // videoWidth/videoHeight 已经在上面获取了
      } else if (isRecording && originalVideoSize) {
        // 录制模式：使用 originalVideoSize，与渲染逻辑一致
        videoWidthForDOM = originalVideoSize.width;
        videoHeightForDOM = originalVideoSize.height;
        containerElement = recordingPreviewRef.current?.parentElement || overlayElement?.parentElement || null;
      } else if (isRecording && recordingPreviewRef.current && recordingPreviewRef.current.videoWidth > 0) {
        // 回退：如果 originalVideoSize 不可用，使用 recordingPreviewRef
        videoWidthForDOM = recordingPreviewRef.current.videoWidth;
        videoHeightForDOM = recordingPreviewRef.current.videoHeight;
        containerElement = recordingPreviewRef.current.parentElement;
      } else {
        containerElement = overlayElement?.parentElement || null;
      }
      
      const containerWidth = containerElement?.clientWidth || 1;
      const containerHeight = containerElement?.clientHeight || 1;
      const videoMinSize = videoWidthForDOM > 0 && videoHeightForDOM > 0 ? Math.min(videoWidthForDOM, videoHeightForDOM) : 0;
      
      // 计算 scale（与渲染逻辑一致）
      const scaleX = videoWidthForDOM > 0 ? containerWidth / videoWidthForDOM : 1;
      const scaleY = videoHeightForDOM > 0 ? containerHeight / videoHeightForDOM : 1;
      const scale = Math.min(scaleX, scaleY);
      
      // 计算相对于容器的百分比（与渲染逻辑一致）
      const camSizePixels = videoMinSize > 0 ? (videoMinSize * newWidth) / 100 : 0;
      const camSizeDisplay = camSizePixels * scale;
      const camSizePercent = containerWidth > 0 && camSizeDisplay > 0
        ? (camSizeDisplay / containerWidth) * 100
        : newWidth;
      
      // 确保直接修改 DOM，避免 React 重新渲染覆盖
      overlayElement.style.width = `${camSizePercent}%`; // 使用计算后的百分比
      overlayElement.style.aspectRatio = '1 / 1';

      // 同步到 Hook Ref（用于录制时 Canvas 绘制），但不更新 React 状态（避免频繁重新渲染）
      updateCameraConfigRef({ width: newWidth });
      dragStartRef.current = { x: clientX, y: clientY };
      return;
    }

    if (!isDraggingRef.current) return;

    const dx = clientX - dragStartRef.current.x;
    const dy = clientY - dragStartRef.current.y;

    // 获取容器的实际尺寸，而不是窗口尺寸
    // 这样移动会更准确和灵敏
    const dragContainerElement = cameraOverlayRef.current?.parentElement?.parentElement;
    const containerWidth = dragContainerElement?.clientWidth || window.innerWidth;
    const containerHeight = dragContainerElement?.clientHeight || window.innerHeight;

    // Update config percentage based on container size
    const newX = virtualConfigRef.current.x + (dx / containerWidth) * 100;
    const newY = virtualConfigRef.current.y + (dy / containerHeight) * 100;

    // 限制在容器范围内
    const clampedX = Math.max(0, Math.min(100, newX));
    const clampedY = Math.max(0, Math.min(100, newY));

    // Update Virtual Ref
    virtualConfigRef.current = { ...virtualConfigRef.current, x: clampedX, y: clampedY };

    // Direct DOM update
    if (cameraOverlayRef.current.parentElement) {
      cameraOverlayRef.current.parentElement.style.left = `${clampedX}%`;
      cameraOverlayRef.current.parentElement.style.top = `${clampedY}%`;
    }

    // Direct Hook Ref update
    updateCameraConfigRef({ x: clampedX, y: clampedY });

    dragStartRef.current = { x: clientX, y: clientY };
  };

  const handleDragEnd = () => {
    if (isDraggingRef.current || isResizingRef.current) {
      const wasDragging = isDraggingRef.current;
      const wasResizing = isResizingRef.current;
      const finalVirtualConfig = { ...virtualConfigRef.current };
      const beforeCameraConfig = { ...cameraConfig };
      
      isDraggingRef.current = false;
      isResizingRef.current = false;
      edgeResizeRef.current = 'none';
      
      // 获取 DOM 当前样式
      let domStyleBefore: any = null;
      let domStyleAfter: any = null;
      if (cameraOverlayRef.current?.parentElement) {
        const el = cameraOverlayRef.current.parentElement;
        domStyleBefore = {
          left: window.getComputedStyle(el).left,
          top: window.getComputedStyle(el).top,
          width: window.getComputedStyle(el).width
        };
      }
      
      // Commit final state to React
      setCameraConfig(finalVirtualConfig);
      
      // 等待 React 重新渲染后检查 DOM
      setTimeout(() => {
        if (cameraOverlayRef.current?.parentElement) {
          const el = cameraOverlayRef.current.parentElement;
          domStyleAfter = {
            left: window.getComputedStyle(el).left,
            top: window.getComputedStyle(el).top,
            width: window.getComputedStyle(el).width
          };
        }
      }, 0);
      
      // Reset cursor
      if (cameraOverlayRef.current?.parentElement) {
        cameraOverlayRef.current.parentElement.style.cursor = 'move';
      }
    }
  };

  // 录制流实时预览（方案 A：直接使用合成流）
  const recordingPreviewRef = useRef<HTMLVideoElement | null>(null);
  const recordingDisplayCanvasRef = useRef<HTMLCanvasElement | null>(null); // Windows 后备显示 canvas

  // 监听 isRecording 状态变化
  useEffect(() => {
    console.log('[VideoRecorder] isRecording state changed:', isRecording);
    if (isRecording) {
      console.log('[VideoRecorder] Recording started! Stream ref:', !!streamRef?.current);
    }
  }, [isRecording, streamRef]);
  
  useEffect(() => {
    if (isRecording && recordingPreviewRef.current) {
      console.log('[VideoRecorder] ========== RECORDING PREVIEW BIND DEBUG ==========');
      console.log('[VideoRecorder] Is recording:', isRecording);
      console.log('[VideoRecorder] Recording preview ref exists:', !!recordingPreviewRef.current);
      console.log('[VideoRecorder] Stream ref exists:', !!streamRef?.current);
      console.log('[VideoRecorder] Stream ref active:', streamRef?.current?.active);
      console.log('[VideoRecorder] Stream tracks:', streamRef?.current?.getTracks().length);
      
      if (streamRef?.current) {
        console.log('[VideoRecorder] Binding recording preview stream');
        recordingPreviewRef.current.srcObject = streamRef.current;
        recordingPreviewRef.current.play()
          .then(() => {
            console.log('[VideoRecorder] Recording preview video started playing');
          })
          .catch((err) => {
            console.error('[VideoRecorder] Failed to play recording preview:', err);
          });
      } else {
        console.warn('[VideoRecorder] Stream ref is null, cannot bind preview');
      }
      console.log('[VideoRecorder] ========== END RECORDING PREVIEW BIND DEBUG ==========');
    } else if (!isRecording && recordingPreviewRef.current) {
      // 停止录制时清理
      recordingPreviewRef.current.srcObject = null;
    }
  }, [isRecording, streamRef]);

  // Windows 后备方案：录制模式使用 Canvas 显示视频内容
  useEffect(() => {
    console.log('[VideoRecorder] Recording canvas effect triggered, isRecording:', isRecording, 'streamRef:', !!streamRef?.current);
    
    if (!isRecording) {
      console.log('[VideoRecorder] Not recording, skipping canvas setup');
      return;
    }
    
    // 等待 streamRef 准备好（最多等待 5 秒）
    if (!streamRef?.current) {
      console.log('[VideoRecorder] Stream ref not ready yet, will retry...');
      let retryCount = 0;
      const maxRetries = 50; // 5 秒
      const checkInterval = setInterval(() => {
        retryCount++;
        if (streamRef?.current) {
          clearInterval(checkInterval);
          console.log('[VideoRecorder] Stream ref ready now after', retryCount * 100, 'ms, setting up canvas');
          // 强制重新渲染以触发 canvas 设置
          // 通过短暂延迟来确保 video 元素已经绑定
          setTimeout(() => {
            if (recordingPreviewRef.current && recordingDisplayCanvasRef.current) {
              console.log('[VideoRecorder] Retrying canvas setup after stream ready');
            }
          }, 100);
        } else if (!isRecording || retryCount >= maxRetries) {
          clearInterval(checkInterval);
          if (retryCount >= maxRetries) {
            console.warn('[VideoRecorder] Stream ref not ready after', maxRetries * 100, 'ms');
          }
        }
      }, 100);
      
      return () => clearInterval(checkInterval);
    }
    
    const video = recordingPreviewRef.current;
    const canvas = recordingDisplayCanvasRef.current;
    
    console.log('[VideoRecorder] Recording canvas refs:', {
      video: !!video,
      canvas: !!canvas,
      videoSrcObject: !!video?.srcObject,
      videoReadyState: video?.readyState,
      streamRef: !!streamRef?.current,
      streamActive: streamRef?.current?.active
    });
    
    if (!video || !canvas) {
      console.warn('[VideoRecorder] Missing video or canvas ref, cannot setup recording canvas');
      // 延迟重试
      const retryTimeout = setTimeout(() => {
        if (isRecording && recordingPreviewRef.current && recordingDisplayCanvasRef.current) {
          console.log('[VideoRecorder] Retrying canvas setup...');
        }
      }, 500);
      return () => clearTimeout(retryTimeout);
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn('[VideoRecorder] Cannot get canvas context');
      return;
    }
    
    console.log('[VideoRecorder] Setting up recording canvas drawing');
    
    let animationFrameId: number | null = null;
    
    const updateCanvasSize = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        console.log('[VideoRecorder] Recording canvas size updated:', { width: canvas.width, height: canvas.height });
      }
    };
    
    const drawFrame = () => {
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && !video.paused) {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        } catch (e) {
          console.warn('[VideoRecorder] Recording canvas draw error:', e);
        }
      }
      if (!video.paused && !video.ended && isRecording) {
        animationFrameId = requestAnimationFrame(drawFrame);
      }
    };
    
    const startDrawing = () => {
      console.log('[VideoRecorder] Starting recording canvas drawing');
      updateCanvasSize();
      drawFrame();
    };
    
    video.addEventListener('loadedmetadata', () => {
      console.log('[VideoRecorder] Recording video metadata loaded, updating canvas');
      updateCanvasSize();
    });
    video.addEventListener('play', () => {
      console.log('[VideoRecorder] Recording video play event, starting canvas drawing');
      startDrawing();
    });
    video.addEventListener('playing', () => {
      console.log('[VideoRecorder] Recording video playing event, starting canvas drawing');
      startDrawing();
    });
    
    // 如果视频已经在播放，立即开始绘制
    if (!video.paused && video.readyState >= 2) {
      console.log('[VideoRecorder] Recording video already playing, starting canvas drawing immediately');
      startDrawing();
    }
    
    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      video.removeEventListener('loadedmetadata', updateCanvasSize);
      video.removeEventListener('play', startDrawing);
      video.removeEventListener('playing', startDrawing);
    };
  }, [isRecording, streamRef]);

  // 小按钮切换导出设置（格式 / FPS），点击循环选项，避免笨重下拉框
  const cycleFormat = () => {
    setSaveFormat(prev => (prev === 'mp4' ? 'gif' : 'mp4'));
  };
  const cycleFps = () => {
    setTargetFrameRate(prev => (prev === 30 ? 60 : 30));
  };

  const getRecordingPreviewClassName = () => {
    // 预览填满，保持原始比例
    return 'w-full h-full';
  };

  return (
    <div
      className="fixed inset-0 bg-transparent flex flex-col pointer-events-auto select-none overflow-hidden font-sans"
      onMouseMove={handleDragMove}
      onMouseUp={handleDragEnd}
      onTouchMove={handleDragMove}
      onTouchEnd={handleDragEnd}
    >
      {/* Preview Mode（预览准备阶段） */}
      {(() => {
        if (isPreviewReady && !isRecording) {
          console.log('[VideoRecorder] ========== PREVIEW MODE RENDERING ==========');
          console.log('[VideoRecorder] isPreviewReady:', isPreviewReady);
          console.log('[VideoRecorder] isRecording:', isRecording);
          console.log('[VideoRecorder] previewVideoRef exists:', !!previewVideoRef.current);
          console.log('[VideoRecorder] previewVideoRef srcObject:', !!previewVideoRef.current?.srcObject);
          console.log('[VideoRecorder] ========== END PREVIEW MODE RENDERING ==========');
        }
        return null;
      })()}
      {isPreviewReady && !isRecording && (
        <div className="absolute inset-0 bg-slate-900 flex flex-col" style={{ zIndex: 40 }}>
          {/* 隐藏的 Canvas 用于区域裁剪 */}
          {previewRegion && (
            <canvas
              ref={previewCanvasRef}
              className="hidden"
            />
          )}
          {/* 预览画面 */}
          <div className="flex-1 flex items-center justify-center relative overflow-hidden bg-slate-800">
            {/* Windows 后备方案：使用 Canvas 显示视频内容 */}
            <canvas
              ref={previewDisplayCanvasRef}
              className="w-full h-full"
              style={{
                display: 'block',
                visibility: 'visible',
                opacity: 1,
                backgroundColor: '#1e293b', // 深灰色背景，确保 canvas 可见
                minWidth: '100px',
                minHeight: '100px',
                width: '100%',
                height: '100%',
                position: 'absolute',
                top: 0,
                left: 0,
                zIndex: 31, // 在 video 元素之上
                objectFit: 'contain',
                pointerEvents: 'none',
                border: 'none'
              }}
            />
            <video
              ref={previewVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full"
              style={{
                display: 'none', // Windows 上隐藏 video 元素，使用 canvas 显示
                visibility: 'hidden',
                opacity: 0,
                position: 'absolute',
                zIndex: 0,
                objectFit: 'contain'
              }}
              onLoadedMetadata={() => {
                console.log('[VideoRecorder] Preview video metadata loaded');
                console.log('[VideoRecorder] Preview video dimensions:', {
                  videoWidth: previewVideoRef.current?.videoWidth,
                  videoHeight: previewVideoRef.current?.videoHeight,
                  readyState: previewVideoRef.current?.readyState
                });
                // Windows 特定：确保视频播放
                if (previewVideoRef.current && previewVideoRef.current.paused) {
                  previewVideoRef.current.play().catch(e => console.error('[VideoRecorder] Auto-play failed:', e));
                }
              }}
              onCanPlay={() => {
                console.log('[VideoRecorder] Preview video can play');
                // Windows 特定：确保视频播放
                if (previewVideoRef.current && previewVideoRef.current.paused) {
                  previewVideoRef.current.play().catch(e => console.error('[VideoRecorder] CanPlay play failed:', e));
                }
              }}
              onPlay={() => {
                console.log('[VideoRecorder] Preview video started playing');
                const videoEl = previewVideoRef.current;
                if (videoEl) {
                  const computedStyle = window.getComputedStyle(videoEl);
                  const rect = videoEl.getBoundingClientRect();
                  console.log('[VideoRecorder] Video element display state:', {
                    display: computedStyle.display,
                    visibility: computedStyle.visibility,
                    opacity: computedStyle.opacity,
                    width: videoEl.offsetWidth,
                    height: videoEl.offsetHeight,
                    boundingRect: {
                      x: rect.x,
                      y: rect.y,
                      width: rect.width,
                      height: rect.height,
                      top: rect.top,
                      left: rect.left
                    },
                    zIndex: computedStyle.zIndex,
                    position: computedStyle.position,
                    backgroundColor: computedStyle.backgroundColor
                  });
                  
                  // Windows 调试：检查视频流是否真的有内容
                  const stream = videoEl.srcObject as MediaStream;
                  if (stream) {
                    const videoTrack = stream.getVideoTracks()[0];
                    if (videoTrack) {
                      const settings = videoTrack.getSettings();
                      console.log('[VideoRecorder] Video track settings:', settings);
                      console.log('[VideoRecorder] Video track enabled:', videoTrack.enabled);
                      console.log('[VideoRecorder] Video track readyState:', videoTrack.readyState);
                      
                      // Windows 调试：检查视频元素是否真的在渲染
                      // 创建一个 canvas 来测试视频内容
                      setTimeout(() => {
                        const canvas = document.createElement('canvas');
                        canvas.width = videoEl.videoWidth || 100;
                        canvas.height = videoEl.videoHeight || 100;
                        const ctx = canvas.getContext('2d');
                        if (ctx && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
                          try {
                            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                            const imageData = ctx.getImageData(0, 0, Math.min(10, canvas.width), Math.min(10, canvas.height));
                            const pixels = imageData.data;
                            // 检查是否有非黑色像素
                            let hasNonBlackPixels = false;
                            for (let i = 0; i < pixels.length; i += 4) {
                              const r = pixels[i];
                              const g = pixels[i + 1];
                              const b = pixels[i + 2];
                              if (r > 10 || g > 10 || b > 10) {
                                hasNonBlackPixels = true;
                                break;
                              }
                            }
                            console.log('[VideoRecorder] Video content check:', {
                              hasContent: hasNonBlackPixels,
                              samplePixels: Array.from(pixels.slice(0, 20))
                            });
                            
                          } catch (e) {
                            console.warn('[VideoRecorder] Failed to check video content:', e);
                          }
                        }
                      }, 500);
                    }
                  }
                }
              }}
              onError={(e) => {
                console.error('[VideoRecorder] Preview video error:', e);
                console.error('[VideoRecorder] Video error details:', {
                  error: previewVideoRef.current?.error,
                  networkState: previewVideoRef.current?.networkState,
                  readyState: previewVideoRef.current?.readyState
                });
              }}
            />
            
            {/* 摄像头预览（如果启用） */}
            {includeCamera && (() => {
              // 关键修复：拖动/缩放过程中，不通过 React style 设置 width/left/top
              // 让 DOM 保持我们直接设置的值，避免 React 重新渲染时覆盖
              const isInteracting = isDraggingRef.current || isResizingRef.current;
              const activeConfig = isInteracting ? virtualConfigRef.current : cameraConfig;
              
              // 获取当前 DOM 样式（用于调试）
              let currentDomStyle: any = null;
              if (cameraOverlayRef.current?.parentElement) {
                const el = cameraOverlayRef.current.parentElement;
                currentDomStyle = {
                  left: window.getComputedStyle(el).left,
                  top: window.getComputedStyle(el).top,
                  width: window.getComputedStyle(el).width
                };
              }
              
              // 计算摄像头大小（仅在非交互状态）
              let camSizePercent: number;
              let camX: number;
              let camY: number;
              
              if (!isInteracting) {
                // 非交互状态：正常计算
                const videoWidth = originalVideoSize?.width || previewVideoRef.current?.videoWidth || 0;
                const videoHeight = originalVideoSize?.height || previewVideoRef.current?.videoHeight || 0;
                const videoMinSize = videoWidth > 0 && videoHeight > 0 
                  ? Math.min(videoWidth, videoHeight) 
                  : 0;
                const containerElement = previewVideoRef.current?.parentElement;
                const containerWidth = containerElement?.clientWidth || 1;
                const containerHeight = containerElement?.clientHeight || 1;
                const scaleX = videoWidth > 0 ? containerWidth / videoWidth : 1;
                const scaleY = videoHeight > 0 ? containerHeight / videoHeight : 1;
                const scale = Math.min(scaleX, scaleY);
                const camSizePixels = videoMinSize > 0 
                  ? (videoMinSize * activeConfig.width) / 100 
                  : 0;
                const camSizeDisplay = camSizePixels * scale;
                camSizePercent = containerWidth > 0 && camSizeDisplay > 0
                  ? (camSizeDisplay / containerWidth) * 100
                  : activeConfig.width;
                camX = activeConfig.x;
                camY = activeConfig.y;
              } else {
                // 交互状态：使用 virtualConfigRef 的值，但不设置 width/left/top（让 DOM 保持直接设置的值）
                camSizePercent = activeConfig.width; // 这个值不会被使用（因为下面不设置 width）
                camX = activeConfig.x; // 这个值不会被使用（因为下面不设置 left）
                camY = activeConfig.y; // 这个值不会被使用（因为下面不设置 top）
              }
              
              // 构建 style 对象：交互时不设置 width/left/top，让 DOM 保持直接设置的值
              const styleObj: React.CSSProperties = {
                position: 'absolute',
                aspectRatio: '1 / 1',
                transform: 'translate(-50%, -50%)',
                zIndex: 40,
                pointerEvents: 'auto',
                height: 'auto'
              };
              
              // 仅在非交互状态设置 width/left/top
              if (!isInteracting) {
                styleObj.left = `${camX}%`;
                styleObj.top = `${camY}%`;
                styleObj.width = `${camSizePercent}%`;
              }
              // 交互状态：不设置 width/left/top，让 DOM 保持 handleDragMove 直接设置的值
              
              return (
              <div
                style={styleObj}
                className={`group relative overflow-hidden ring-1 ring-white/20 shadow-2xl ${activeConfig.shape === 'circle' ? 'rounded-full' : 'rounded-2xl'}`}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleDragStart(e);
                }}
                onMouseMove={(e) => {
                  e.stopPropagation();
                  if (!isDraggingRef.current && !isResizingRef.current) {
                    const edge = detectEdge(e);
                    const cursor = getEdgeCursor(edge);
                    if (cameraOverlayRef.current?.parentElement) {
                      cameraOverlayRef.current.parentElement.style.cursor = cursor;
                    }
                  } else if (isDraggingRef.current && !isResizingRef.current) {
                    const edge = detectEdge(e);
                    if (edge !== 'none') {
                      edgeResizeRef.current = edge;
                      isResizingRef.current = true;
                      isDraggingRef.current = false;
                      dragStartRef.current = { x: e.clientX, y: e.clientY };
                      virtualConfigRef.current = cameraConfig;
                    }
                  }
                  handleDragMove(e);
                }}
                onMouseUp={(e) => {
                  e.stopPropagation();
                  handleDragEnd();
                }}
                onMouseLeave={(e) => {
                  e.stopPropagation();
                  handleDragEnd();
                }}
              >
                <video
                  ref={cameraOverlayRef}
                  className="w-full h-full object-cover pointer-events-none"
                  autoPlay 
                  muted 
                  playsInline
                  onLoadedMetadata={() => {
                    console.log('[VideoRecorder] Preview camera overlay video metadata loaded');
                    console.log('[VideoRecorder] Video dimensions:', {
                      videoWidth: cameraOverlayRef.current?.videoWidth,
                      videoHeight: cameraOverlayRef.current?.videoHeight
                    });
                  }}
                  onPlay={() => {
                    console.log('[VideoRecorder] Preview camera overlay video started playing');
                  }}
                  onError={(e) => {
                    console.error('[VideoRecorder] Preview camera overlay video error:', e);
                  }}
                />
                <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors group-hover:block" />
                <div
                  className="absolute bottom-2 right-2 w-4 h-4 bg-white/50 hover:bg-white rounded-full cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity z-30"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    handleResizeStart(e);
                  }}
                />
              </div>
              );
            })()}
          </div>
          
          {/* 预览控制栏 */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent p-6 flex items-center justify-center gap-4 z-50">
            <button
              onClick={handleCancelPreview}
              className="px-6 py-3 bg-slate-700/80 hover:bg-slate-600/80 backdrop-blur-md rounded-full text-white font-medium transition-all"
            >
              取消
            </button>
            <button
              onClick={handleStartFromPreview}
              className="px-8 py-3 bg-gradient-to-tr from-blue-600 to-blue-400 hover:from-blue-500 hover:to-blue-300 rounded-full text-white font-semibold shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
            >
              <div className="w-3 h-3 bg-white rounded-full" />
              开始录制
            </button>
          </div>
          
          {/* 提示文字 */}
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black/50 backdrop-blur-md px-4 py-2 rounded-full text-white/90 text-sm z-50">
            预览模式：调整摄像头位置和大小，然后点击开始录制
          </div>
        </div>
      )}
      
      {/* Background Preview（未录制且非预览模式时） */}
      {!isRecording && !isPreviewReady && (
        <div className="absolute inset-0 bg-slate-900 z-0">
          <video
            ref={previewVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-black/30" />
        </div>
      )}

      {/* Recording Preview（录制中：展示实际录制画面，包括区域裁剪与摄像头叠加） */}
      {isRecording && (
        <>
        <div className="absolute inset-0 bg-black z-0 flex items-center justify-center" style={{ pointerEvents: 'none' }}>
          {/* 如果 streamRef 还没有准备好，显示加载提示 */}
          {!streamRef?.current && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50">
              <div className="text-white text-lg">正在启动录制...</div>
            </div>
          )}
          <div className={`flex items-center justify-center ${getRecordingPreviewClassName()} pointer-events-none relative`}>
            {/* Windows 后备方案：使用 Canvas 显示录制视频内容 */}
            <canvas
              ref={recordingDisplayCanvasRef}
              className="w-full h-full"
              style={{
                display: 'block',
                visibility: 'visible',
                opacity: 1,
                backgroundColor: 'transparent',
                minWidth: '100px',
                minHeight: '100px',
                width: '100%',
                height: '100%',
                position: 'absolute',
                top: 0,
                left: 0,
                zIndex: 1,
                objectFit: 'contain',
                pointerEvents: 'none'
              }}
            />
            <video
              ref={recordingPreviewRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-contain bg-black pointer-events-none"
              style={{
                display: 'none', // Windows 上隐藏 video 元素，使用 canvas 显示
                visibility: 'hidden',
                opacity: 0,
                position: 'absolute',
                zIndex: 0
              }}
              onLoadedMetadata={() => {
                console.log('[VideoRecorder] Recording preview video metadata loaded');
                console.log('[VideoRecorder] Recording preview dimensions:', {
                  videoWidth: recordingPreviewRef.current?.videoWidth,
                  videoHeight: recordingPreviewRef.current?.videoHeight
                });
              }}
              onPlay={() => {
                console.log('[VideoRecorder] Recording preview video started playing');
              }}
              onError={(e) => {
                console.error('[VideoRecorder] Recording preview video error:', e);
              }}
            />
          </div>
        </div>
        
        {/* 录制控制按钮（固定在顶部，不遮挡录制内容，独立容器确保可点击） */}
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 shadow-lg" style={{ pointerEvents: 'auto', zIndex: 9999 }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                console.log('[VideoRecorder] Pause/Resume button clicked, isPaused:', isPaused);
                if (isPaused) {
                  resumeRecording();
                } else {
                  pauseRecording();
                }
              }}
              className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors cursor-pointer"
              title={isPaused ? '继续录制' : '暂停录制'}
            >
              {isPaused ? <IconPlay size={14} fill="white" /> : <IconPause size={14} fill="white" />}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                console.log('[VideoRecorder] Stop button clicked');
                stopRecording();
              }}
              className="w-8 h-8 bg-gradient-to-tr from-red-600 to-red-400 rounded-full flex items-center justify-center shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
              title="停止录制"
            >
              <div className="w-3 h-3 bg-white rounded flex items-center justify-center" />
            </button>

            <div className="flex items-center gap-2 px-2">
              <span className="text-white font-mono text-sm font-semibold tracking-wide tabular-nums">
                {formatDuration(recordingDuration)}
              </span>
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${isPaused ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'} animate-pulse`}>
                {isPaused ? '暂停' : '录制中'}
              </span>
            </div>
          </div>
        </>
      )}

      {/* Camera Overlay（未录制时也显示，预览模式下不显示，因为已经在预览画面中叠加了） */}
      {includeCamera && !isPreviewReady && (() => {
        // 关键修复：拖动/缩放过程中，不通过 React style 设置 width/left/top
        // 让 DOM 保持我们直接设置的值，避免 React 重新渲染时覆盖
        const isInteracting = isDraggingRef.current || isResizingRef.current;
        const activeConfig = isInteracting ? virtualConfigRef.current : cameraConfig;
        
        // 获取当前 DOM 样式（用于调试）
        let currentDomStyle: any = null;
        if (cameraOverlayRef.current?.parentElement) {
          const el = cameraOverlayRef.current.parentElement;
          currentDomStyle = {
            left: window.getComputedStyle(el).left,
            top: window.getComputedStyle(el).top,
            width: window.getComputedStyle(el).width
          };
        }
        
        // 计算摄像头大小（仅在非交互状态）
        let camSizePercent: number;
        let camX: number;
        let camY: number;
        
        if (!isInteracting) {
          // 非交互状态：正常计算
          camSizePercent = activeConfig.width; // 默认使用配置的百分比
          
          if (isRecording && recordingPreviewRef.current && originalVideoSize) {
            // 录制模式：使用与 canvas 绘制相同的计算逻辑
            const videoWidth = originalVideoSize.width;
            const videoHeight = originalVideoSize.height;
            const videoMinSize = Math.min(videoWidth, videoHeight);
            const containerElement = recordingPreviewRef.current?.parentElement;
            const containerWidth = containerElement?.clientWidth || 1;
            const containerHeight = containerElement?.clientHeight || 1;
            const scaleX = videoWidth > 0 ? containerWidth / videoWidth : 1;
            const scaleY = videoHeight > 0 ? containerHeight / videoHeight : 1;
            const scale = Math.min(scaleX, scaleY);
            const camSizePixels = (videoMinSize * activeConfig.width) / 100;
            const camSizeDisplay = camSizePixels * scale;
            camSizePercent = containerWidth > 0 && camSizeDisplay > 0
              ? (camSizeDisplay / containerWidth) * 100
              : activeConfig.width;
          }
          
          camX = activeConfig.x;
          camY = activeConfig.y;
        } else {
          // 交互状态：使用 virtualConfigRef 的值，但不设置 width/left/top（让 DOM 保持直接设置的值）
          camSizePercent = activeConfig.width;
          camX = activeConfig.x;
          camY = activeConfig.y;
        }
        
        // 构建 style 对象：交互时不设置 width/left/top，让 DOM 保持直接设置的值
        const styleObj: React.CSSProperties = {
          position: 'absolute',
          aspectRatio: '1 / 1',
          transform: 'translate(-50%, -50%)',
          zIndex: isRecording ? 40 : 50,
          pointerEvents: 'auto',
          height: 'auto'
        };
        
        // 仅在非交互状态设置 width/left/top
        if (!isInteracting) {
          styleObj.left = `${camX}%`;
          styleObj.top = `${camY}%`;
          styleObj.width = `${camSizePercent}%`;
        }
        // 交互状态：不设置 width/left/top，让 DOM 保持 handleDragMove 直接设置的值
        
        return (
        <div
          style={styleObj}
          className={`group relative overflow-hidden ring-1 ring-white/20 shadow-2xl ${activeConfig.shape === 'circle' ? 'rounded-full' : 'rounded-2xl'}`}
          onMouseDown={(e) => {
            e.stopPropagation();  // 阻止事件冒泡，确保不被其他元素拦截
            handleDragStart(e);
          }}
          onMouseMove={(e) => {
            e.stopPropagation();  // 阻止事件冒泡
            // Show resize cursor on edges
            if (!isDraggingRef.current && !isResizingRef.current) {
              const edge = detectEdge(e);
              const cursor = getEdgeCursor(edge);
              if (cameraOverlayRef.current?.parentElement) {
                cameraOverlayRef.current.parentElement.style.cursor = cursor;
              }
            } else if (isDraggingRef.current && !isResizingRef.current) {
              // 如果在拖动过程中鼠标移到了边缘，切换到边缘调整模式
              const edge = detectEdge(e);
              if (edge !== 'none') {
                edgeResizeRef.current = edge;
                isResizingRef.current = true;
                isDraggingRef.current = false;
                dragStartRef.current = { x: e.clientX, y: e.clientY };
                virtualConfigRef.current = cameraConfig;
              }
            }
            handleDragMove(e);
          }}
          onMouseUp={(e) => {
            e.stopPropagation();  // 阻止事件冒泡
            handleDragEnd();
          }}
          onMouseLeave={(e) => {
            e.stopPropagation();  // 阻止事件冒泡
            handleDragEnd();
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
            handleDragStart(e);
          }}
          onTouchMove={(e) => {
            e.stopPropagation();
            handleDragMove(e);
          }}
          onTouchEnd={(e) => {
            e.stopPropagation();
            handleDragEnd();
          }}
        >
          <video
            ref={cameraOverlayRef}
            className="w-full h-full object-cover pointer-events-none"
            autoPlay 
            muted 
            playsInline
            onLoadedMetadata={() => {
              console.log('[VideoRecorder] Camera overlay video metadata loaded');
              console.log('[VideoRecorder] Video dimensions:', {
                videoWidth: cameraOverlayRef.current?.videoWidth,
                videoHeight: cameraOverlayRef.current?.videoHeight
              });
            }}
            onPlay={() => {
              console.log('[VideoRecorder] Camera overlay video started playing');
            }}
            onError={(e) => {
              console.error('[VideoRecorder] Camera overlay video error:', e);
            }}
          />
          {/* Resize Handle */}
          <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors group-hover:block" />
          <div
            className="absolute bottom-2 right-2 w-4 h-4 bg-white/50 hover:bg-white rounded-full cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity z-30"
            onMouseDown={(e) => {
              e.stopPropagation();
              handleResizeStart(e);
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              handleResizeStart(e);
            }}
          />
        </div>
        );
      })()}
      

      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-50">
        <div className="flex gap-2">
          {/* Language/Settings Toggle */}
          <button
            onClick={() => setShowSettingsMenu(!showSettingsMenu)}
            className="p-2 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full text-white/80 hover:text-white transition-all"
          >
            <IconSettings size={20} />
          </button>

          {showSettingsMenu && (
            <div className="absolute top-12 left-4 bg-slate-800/90 backdrop-blur-xl border border-white/10 p-4 rounded-xl flex flex-col gap-4 w-64 shadow-2xl animate-in fade-in slide-in-from-top-2">
              {/* Camera Size */}
              <div className="flex justify-between items-center">
                <span className="text-sm text-white">{t('recorder.size')}</span>
                <input
                  type="range"
                  min="10"
                  max="50"
                  value={cameraConfig.width}
                  onChange={(e) => setCameraConfig({ ...cameraConfig, width: Number(e.target.value) })}
                  className="w-24 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              {/* Shape */}
              <div className="flex justify-between items-center">
                <span className="text-sm text-white">{t('recorder.camera_shape')}</span>
                <div className="flex bg-slate-700/50 rounded p-1">
                  <button
                    onClick={() => setCameraConfig({ ...cameraConfig, shape: 'circle' })}
                    className={`p-1 rounded ${cameraConfig.shape === 'circle' ? 'bg-blue-500 text-white' : 'text-white/50'}`}
                  >
                    <div className="w-4 h-4 rounded-full border border-current" />
                  </button>
                  <button
                    onClick={() => setCameraConfig({ ...cameraConfig, shape: 'square' })}
                    className={`p-1 rounded ${cameraConfig.shape === 'square' ? 'bg-blue-500 text-white' : 'text-white/50'}`}
                  >
                    <div className="w-4 h-4 rounded-sm border border-current" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="p-2 bg-red-500/10 hover:bg-red-500/20 backdrop-blur-md rounded-full text-red-500 hover:text-red-400 transition-all"
        >
          <IconX size={20} />
        </button>
      </div>

      {/* Center Hint（未录制时，更紧凑的提示区域） */}
      {!isRecording && !isPreviewReady && (
        <div className="flex-1 flex flex-col items-center justify-center pointer-events-none z-20">
          <div className="bg-black/25 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/5 text-center max-w-md">
            <p className="text-white/90 text-base font-medium tracking-wide">
              {t('recorder.shortcut_hint')}
            </p>
            <div className="mt-1.5 flex items-center justify-center gap-2 text-[11px] text-white/55">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              {t('recorder.shortcut_hint_recording')}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Controls（预览模式下隐藏） */}
      {!isPreviewReady && (
      <div className="mt-auto mb-4 flex justify-center items-end gap-4 z-40 pointer-events-auto">
        {/* Device Toggles */}
        {!isRecording && (
          <div className="flex gap-2 bg-black/40 backdrop-blur-xl p-2 rounded-2xl border border-white/10 shadow-lg">
            <ToggleButton
              isActive={includeMicrophone}
              onClick={() => setIncludeMicrophone(!includeMicrophone)}
              icon={IconMic}
              tooltip={t('recorder.mic_tooltip')}
            />
            <ToggleButton
              isActive={includeSystemAudio}
              onClick={() => setIncludeSystemAudio(!includeSystemAudio)}
              icon={IconVolume2} // Or similar
              tooltip={t('recorder.audio_tooltip')}
            />
            <ToggleButton
              isActive={includeCamera}
              onClick={() => setIncludeCamera(!includeCamera)}
              icon={IconCamera}
              tooltip={t('recorder.camera_tooltip')}
            />
          </div>
        )}

        {/* Main Action Button + pre-record export settings */}
        <div className="relative group pointer-events-auto">
          <div
            className={`absolute inset-0 rounded-full blur-xl transition-all duration-500 ${
              isRecording ? 'bg-red-500/30 group-hover:bg-red-500/50' : 'bg-blue-500/30 group-hover:bg-blue-500/50'
            }`}
            style={{ pointerEvents: 'none' }}
          />

          {!isRecording ? (
            <>
              {/* Main Record Button */}
              <button
                type="button"
                onClick={handleStartRequest}
                className="relative w-20 h-20 bg-gradient-to-tr from-blue-600 to-blue-400 rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer"
              >
                <div className="w-8 h-8 bg-white rounded-full shadow-inner" />
              </button>

              {/* Record Mode Selector (Screen / Area) */}
              <div className="mt-3 flex items-center justify-center gap-2 pointer-events-auto">
                <button
                  type="button"
                  onClick={() => setRecordMode('screen')}
                  className={`px-4 py-1.5 rounded-full text-xs border transition-all cursor-pointer ${
                    recordMode === 'screen'
                      ? 'bg-blue-500 text-white border-blue-400'
                      : 'bg-black/40 text-white/70 border-white/10 hover:bg-black/60'
                  }`}
                >
                  全屏/窗口
                </button>
                <button
                  type="button"
                  onClick={() => setRecordMode('area')}
                  className={`px-4 py-1.5 rounded-full text-xs border transition-all cursor-pointer ${
                    recordMode === 'area'
                      ? 'bg-blue-500 text-white border-blue-400'
                      : 'bg-black/40 text-white/70 border-white/10 hover:bg-black/60'
                  }`}
                >
                  自定义区域
                </button>
              </div>

              {/* Pre-record Export Settings（更轻量的 Chip 按钮，点击循环选项，固定宽度防止抖动） */}
              <div className="mt-4 flex items-center justify-center gap-3 text-[11px] text-white/80 pointer-events-auto">
                <button
                  type="button"
                  onClick={cycleFps}
                  className="w-20 px-2.5 py-1.5 rounded-full bg-black/40 hover:bg-black/60 border border-white/15 hover:border-white/30 transition-colors cursor-pointer text-center"
                  title="点击切换目标帧率"
                >
                  {targetFrameRate} FPS
                </button>
                <button
                  type="button"
                  onClick={cycleFormat}
                  className="w-24 px-2.5 py-1.5 rounded-full bg-black/40 hover:bg-black/60 border border-white/15 hover:border-white/30 transition-colors cursor-pointer text-center"
                  title="点击切换导出格式"
                >
                  {saveFormat === 'mp4' ? 'MP4 (H.264)' : 'GIF'}
                </button>
              </div>
            </>
          ) : (
            // 录制时的按钮已移到录制预览框顶部，这里不再显示
            null
          )}
        </div>
      </div>
      )}

      {/* Source Selector Modal */}
      {showSourceSelector && (
        <div className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center animate-in fade-in zoom-in-95 duration-200`}>
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-[800px] h-[600px] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/5 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white tracking-tight">{t('recorder.select_source')}</h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    console.log('[VideoRecorder] Source selector close button clicked');
                    setShowSourceSelector(false);
                  }} 
                  className="text-white/50 hover:text-white"
                >
                  <IconX />
                </button>
              </div>
            </div>

            <div className="p-6 flex-1 overflow-y-auto grid grid-cols-2 gap-4">
              {availableSources.length === 0 ? (
                <div className="col-span-2 flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-white/70 mb-2">正在加载录制源...</p>
                    <p className="text-white/50 text-sm">如果没有显示，请检查屏幕录制权限</p>
                  </div>
                </div>
              ) : (
                availableSources.map(source => (
                <button
                  key={source.id}
                  onClick={() => {
                    console.log('[VideoRecorder] Source selected:', source.id, source.name);
                    handleSourceSelect(source.id);
                  }}
                  className="group relative aspect-video bg-black/50 rounded-xl overflow-hidden border border-white/5 hover:border-blue-500/50 hover:ring-2 hover:ring-blue-500/20 transition-all text-left"
                >
                  <img src={source.thumbnail} alt={source.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 to-transparent">
                    <div className="flex items-center gap-2">
                      {source.appIcon && <img src={source.appIcon} className="w-4 h-4" />}
                      <span className="text-sm text-white truncate font-medium">{source.name}</span>
                    </div>
                  </div>
                </button>
              ))
              )}
            </div>
          </div>
        </div>
      )}
      

      {/* Exporting Loading Overlay with Progress */}
      {isExporting && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center animate-in fade-in duration-300">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-blue-500/30 border-t-blue-500 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <IconDownload size={24} className="text-blue-500 animate-pulse" />
            </div>
          </div>
          <h3 className="mt-6 text-xl font-bold text-white tracking-tight">{t('recorder.exporting')}</h3>
          <p className="mt-2 text-white/50 text-sm">{t('recorder.exporting_desc')}</p>
          {/* Progress Bar */}
          <div className="mt-6 w-64">
            <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${exportProgress}%` }}
              />
            </div>
            <p className="mt-2 text-center text-white/70 text-sm font-mono">
              {Math.round(exportProgress)}%
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// Helpful Toggle Button Component
const ToggleButton = ({ isActive, onClick, icon: Icon, tooltip }: any) => (
  <button
    onClick={onClick}
    title={tooltip}
    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${isActive ? 'bg-white text-black shadow-lg scale-100' : 'bg-transparent text-white/50 hover:bg-white/10 hover:text-white scale-90'}`}
  >
    <Icon size={20} />
  </button>
);

export default VideoRecorder;