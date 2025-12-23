import { useState, useRef, useEffect, useCallback } from 'react';
import { getMaxRecordingDuration } from '../services/licenseService';
import { FrameBuffer, DropStrategy } from '../utils/frameBuffer';
import { PerformanceOptimizer } from '../utils/performanceOptimizer';

export interface CameraConfig {
    x: number;
    y: number;
    width: number;
    shape: 'circle' | 'square';
}

interface UseVideoRecorderProps {
    initialCameraConfig: CameraConfig;
    onClose?: () => void;
    getTranslation?: (key: string) => string;
    onExportProgress?: (progress: number) => void; // 导出进度回调
}

export const useVideoRecorder = ({ initialCameraConfig, onClose, getTranslation, onExportProgress }: UseVideoRecorderProps) => {
    // State
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [targetFrameRate, setTargetFrameRate] = useState<number>(() => {
        if (typeof window === 'undefined') return 30;
        const v = window.localStorage.getItem('recorder_targetFps');
        const n = v ? Number(v) : 30;
        return n === 60 ? 60 : 30;
    }); // 30 FPS Default
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);

    // Settings
    const [includeCamera, setIncludeCamera] = useState(false);
    const [includeMicrophone, setIncludeMicrophone] = useState(true);
    const [includeSystemAudio, setIncludeSystemAudio] = useState(true);
    const [cameraConfig, setCameraConfig] = useState<CameraConfig>(initialCameraConfig);
    const [saveFormat, setSaveFormat] = useState<'mp4' | 'gif'>(() => {
        if (typeof window === 'undefined') return 'mp4';
        const v = window.localStorage.getItem('recorder_saveFormat');
        return v === 'gif' ? 'gif' : 'mp4';
    }); // Default mp4

    // State synced ref for inner loop access
    const cameraConfigRef = useRef(cameraConfig);
    useEffect(() => { cameraConfigRef.current = cameraConfig; }, [cameraConfig]);
    
    // 存储原始视频尺寸，用于摄像头大小计算（确保预览和录制使用相同的参考尺寸）
    const originalVideoSizeRef = useRef<{ width: number; height: number } | null>(null);

    // Streams & Refs
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null); // The final composite stream
    const cameraStreamRef = useRef<MediaStream | null>(null);
    const displayStreamRef = useRef<MediaStream | null>(null);
    const systemAudioStreamRef = useRef<MediaStream | null>(null);
    const recordingCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Optional recording region (自定义区域录制，借鉴 Cap 的 Region 模式)
  // 注意：这里存的是 **归一化坐标**（0-1），而不是像素坐标
  // x/y/width/height 分别表示相对于捕获屏幕宽高的比例
  const recordingRegionRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

    // Timer Ref
    const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const isProcessingRef = useRef(false);
    const stopRecordingRef = useRef<(() => void) | null>(null);
    
    // Performance optimizations (借鉴 Cap)
    const frameBufferRef = useRef<FrameBuffer | null>(null);
    const lastFrameTimeRef = useRef<number>(0);

    // Helper: Draw Rounded Rect (Hoisted)
    const drawRoundedRect = useCallback((
        context: CanvasRenderingContext2D,
        rx: number,
        ry: number,
        rw: number,
        rh: number,
        radius: number
    ) => {
        const r = Math.min(radius, rw / 2, rh / 2);
        context.beginPath();
        context.moveTo(rx + r, ry);
        context.lineTo(rx + rw - r, ry);
        context.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r);
        context.lineTo(rx + rw, ry + rh - r);
        context.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh);
        context.lineTo(rx + r, ry + rh);
        context.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r);
        context.lineTo(rx, ry + r);
        context.quadraticCurveTo(rx, ry, rx + r, ry);
        context.closePath();
    }, []);

    // Duration Timer
    useEffect(() => {
        if (isRecording && !isPaused) {
            timerIntervalRef.current = setInterval(() => {
                setRecordingDuration(prev => prev + 1);
            }, 1000);
        } else {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
        }
        return () => {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        };
    }, [isRecording, isPaused]);

    // GIF Auto-Stop
    useEffect(() => {
        if (isRecording && saveFormat === 'gif' && recordingDuration >= 60) {
            if (stopRecordingRef.current) {
                stopRecordingRef.current();
            }
        }
    }, [recordingDuration, isRecording, saveFormat]);

    // License-based recording duration limit (10 minutes for unauthorized devices)
    useEffect(() => {
        if (isRecording && !isPaused) {
            const maxDuration = getMaxRecordingDuration();
            if (maxDuration > 0 && recordingDuration >= maxDuration) {
                if (stopRecordingRef.current) {
                    stopRecordingRef.current();
                }
                const message = getTranslation 
                    ? getTranslation('license.recording_limit_reached')
                    : 'Recording stopped: Maximum duration reached (10 minutes). Please activate a license for unlimited recording.';
                alert(message);
            }
        }
    }, [recordingDuration, isRecording, isPaused, getTranslation]);

    // Settings 持久化到 localStorage（格式 / 尺寸 / FPS）
    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                window.localStorage.setItem('recorder_saveFormat', saveFormat);
            } catch {}
        }
    }, [saveFormat]);


    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                window.localStorage.setItem('recorder_targetFps', String(targetFrameRate));
            } catch {}
        }
    }, [targetFrameRate]);

    // 导出进度监听（如果 Electron 支持）
    useEffect(() => {
        if (typeof window !== 'undefined' && 'electronAPI' in window) {
            // 监听导出进度事件
            const handleProgress = (progress: number) => {
                console.log('[Hook] Export progress:', progress);
                setExportProgress(progress);
                onExportProgress?.(progress);
            };
            
            // 设置进度监听器
            if ((window as any).electronAPI?.onExportProgress) {
                const cleanup = (window as any).electronAPI.onExportProgress(handleProgress);
                return cleanup; // 返回清理函数
            }
        }
    }, [onExportProgress]);

  /**
   * Start recording
   * @param sourceId - Electron desktop source id (screen/window)
   * @param region - Optional normalized region (0-1, 相对于屏幕宽高的比例)
   */
  const startRecording = async (
    sourceId: string,
    region?: { x: number; y: number; width: number; height: number }
  ) => {
        console.log('[Hook] ========== START RECORDING ==========');
        console.log('[Hook] sourceId:', sourceId);
        console.log('[Hook] region:', region);
        
        if (isProcessingRef.current) {
            console.log('[Hook] Already processing, returning');
            return;
        }
        isProcessingRef.current = true;
        setRecordingDuration(0);
        setExportProgress(0);
        console.log('[Hook] Processing flag set, starting recording setup...');

    // 存储当前录制区域（如果有，已经是归一化后的 0-1 坐标）
    recordingRegionRef.current = region || null;

        try {
            const isElectron = typeof window !== 'undefined' && 'electronAPI' in window;

            // 初始化帧缓冲（借鉴 Cap）- 简化版，主要用于监控
            // 注意：MediaRecorder 本身已有缓冲，这里主要用于性能监控
            frameBufferRef.current = new FrameBuffer({
                targetFps: targetFrameRate,
                dropStrategy: DropStrategy.DropOldest,
                maxSize: 5, // 较小的缓冲区，因为 MediaRecorder 自己会缓冲
            });
            frameBufferRef.current.adjustQueueDepth(targetFrameRate);

            // 1. Get Screen Stream
            console.log('[Hook] Step 1: Getting screen stream for sourceId:', sourceId);
            let displayStream: MediaStream;
            if (isElectron) {
                console.log('[Hook] Electron environment detected, using getUserMedia with desktop source');
                try {
                    displayStream = await navigator.mediaDevices.getUserMedia({
                        audio: false,
                        video: {
                            // @ts-ignore
                            mandatory: {
                                chromeMediaSource: 'desktop',
                                chromeMediaSourceId: sourceId,
                                minFrameRate: 30,
                                maxFrameRate: 60, // Allow up to 60
                            }
                        } as any
                    });
                    console.log('[Hook] Screen stream obtained:', {
                        id: displayStream.id,
                        active: displayStream.active,
                        videoTracks: displayStream.getVideoTracks().length
                    });
                } catch (e) {
                    console.error('[Hook] Failed to get screen stream:', e);
                    throw e;
                }

                // System Audio (Windows only typically)
                // Use async approach to prevent blocking the main recording flow
                console.log('[Hook] System audio capture, includeSystemAudio:', includeSystemAudio);
                const platform = (window as any).electronAPI?.platform;
                console.log('[Hook] Platform:', platform);
                
                // System Audio: Temporarily disabled to prevent blocking
                // The async approach was still causing issues, so we'll skip it for now
                // TODO: Find a better way to capture system audio on Windows
                console.log('[Hook] System audio capture is temporarily disabled to prevent blocking');
                console.log('[Hook] includeSystemAudio setting:', includeSystemAudio);
                systemAudioStreamRef.current = null;
            } else {
                console.log('[Hook] Not Electron, using getDisplayMedia');
                displayStream = await navigator.mediaDevices.getDisplayMedia({
                    video: { displaySurface: 'monitor' },
                    audio: includeSystemAudio
                });
            }
            displayStreamRef.current = displayStream;
            console.log('[Hook] Screen stream stored in displayStreamRef');
            console.log('[Hook] Continuing to Step 2 (microphone)...');

            // 添加错误处理：WGC 错误通常是警告性的，不影响录制
            try {
                displayStream.getVideoTracks().forEach(track => {
                    track.addEventListener('error', (e: any) => {
                        // WGC ProcessFrame 错误 (-2147467259) 是常见的警告，不影响录制
                        // 系统会自动使用上一帧继续，可以安全忽略
                        if (e.error && e.error.message && e.error.message.includes('ProcessFrame')) {
                            // 静默处理，不输出错误日志
                            return;
                        }
                        console.warn('[RECORDING] Video track error (non-fatal):', e);
                    });
                });
            } catch (e) {
                console.warn('[Hook] Error setting up video track error handlers:', e);
            }

            // 2. Get Microphone
            console.log('[Hook] Step 2: Getting microphone stream, includeMicrophone:', includeMicrophone);
            let picStream: MediaStream | null = null;
            if (includeMicrophone) {
                try {
                    console.log('[Hook] Requesting microphone stream...');
                    // 使用标准采样率 (48kHz) 以确保音视频同步，避免长时间录制时的不同步问题
                    picStream = await navigator.mediaDevices.getUserMedia({ 
                        audio: {
                            sampleRate: 48000,  // 标准采样率，与视频帧率匹配
                            channelCount: 2,    // 立体声
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true
                        }
                    });
                    console.log('[Hook] Microphone stream obtained:', {
                        id: picStream.id,
                        active: picStream.active,
                        audioTracks: picStream.getAudioTracks().length,
                        audioSettings: picStream.getAudioTracks()[0]?.getSettings()
                    });
                } catch (e) { 
                    console.warn('[Hook] Mic failed:', e);
                }
            } else {
                console.log('[Hook] Microphone not included, skipping');
            }

            // 3. Get Camera (if needed)
            console.log('[Hook] Step 3: Getting camera stream, includeCamera:', includeCamera);
            if (includeCamera) {
                try {
                    console.log('[Hook] ========== GET CAMERA STREAM DEBUG ==========');
                    console.log('[Hook] Requesting camera stream...');
                    const camStream = await navigator.mediaDevices.getUserMedia({
                        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
                        audio: false
                    });
                    console.log('[Hook] Camera stream obtained:', {
                        id: camStream.id,
                        active: camStream.active,
                        videoTracks: camStream.getVideoTracks().length,
                        videoTrackSettings: camStream.getVideoTracks()[0]?.getSettings()
                    });
                    cameraStreamRef.current = camStream;
                    console.log('[Hook] Camera stream stored in cameraStreamRef');
                    console.log('[Hook] ========== END GET CAMERA STREAM DEBUG ==========');
                } catch (e) {
                    console.error('[Hook] Camera failed:', e);
                    // Determine if we should fail or continue without camera?
                    // Let's continue but turn off camera flag?
                    // For simplicity, we assume success or user handles error toast in UI
                }
            } else {
                console.log('[Hook] Camera not included, skipping camera stream');
            }

            // 4. Compose Streams
            console.log('[Hook] Step 4: Composing streams');
            console.log('[Hook] hasRegion:', !!recordingRegionRef.current);
            console.log('[Hook] includeCamera:', includeCamera);
            console.log('[Hook] cameraStreamRef.current:', !!cameraStreamRef.current);
            
            let finalStream: MediaStream;

            const hasRegion = !!recordingRegionRef.current;

            // 如果有相机或自定义区域，则使用 Canvas 组合模式（方便做区域裁剪和摄像头叠加）
            // 注意：导出尺寸不影响录制模式，导出尺寸的处理在导出阶段进行
            if ((includeCamera && cameraStreamRef.current) || hasRegion) {
                console.log('[Hook] Using COMPOSITE MODE (Canvas)');
                // --- COMPOSITE MODE (Canvas) with Optimizations & Region Crop ---
                const canvas = document.createElement('canvas');
                recordingCanvasRef.current = canvas;
                const ctx = canvas.getContext('2d', { 
                    alpha: false,
                    desynchronized: true, // 性能优化：异步渲染
                    willReadFrequently: false, // 性能优化：不频繁读取
                });
                
                // 启用高质量图像平滑，确保高清绘制
                if (ctx) {
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high'; // 使用高质量平滑
                }

                // Setup Video Elements for Source
                const screenVideo = document.createElement('video');
                screenVideo.srcObject = displayStream;
                screenVideo.autoplay = true;
                screenVideo.muted = true;

                const cameraVideo = includeCamera && cameraStreamRef.current
                    ? document.createElement('video')
                    : null;

                if (cameraVideo && cameraStreamRef.current) {
                    cameraVideo.srcObject = cameraStreamRef.current;
                    cameraVideo.autoplay = true;
                    cameraVideo.muted = true;
                }

                // Wait for metadata
                const playPromises: Promise<unknown>[] = [screenVideo.play()];
                if (cameraVideo) playPromises.push(cameraVideo.play());

                await Promise.all(playPromises).catch(e => console.error("Video play error", e));

                // Wait for dimensions
                await new Promise(r => setTimeout(r, 200));

                const width = screenVideo.videoWidth || 1920;
                const height = screenVideo.videoHeight || 1080;
                
                // 存储原始视频尺寸，用于摄像头大小计算（确保预览和录制使用相同的参考尺寸）
                originalVideoSizeRef.current = { width, height };

                // 自适应分辨率（借鉴 Cap）
                const optimalScale = PerformanceOptimizer.calculateOptimalScale(
                    width, 
                    height, 
                    targetFrameRate
                );
                const optimalFps = PerformanceOptimizer.calculateOptimalFps(width, height);
                
                // 使用计算出的最佳帧率
                const actualFps = Math.min(targetFrameRate, optimalFps);
                if (actualFps !== targetFrameRate) {
                    setTargetFrameRate(actualFps);
                }
                frameBufferRef.current?.adjustQueueDepth(actualFps);

                // 计算最终裁剪区域（优先使用自定义区域；然后根据导出纵横比做二次裁剪）
                const region = recordingRegionRef.current;
                let cropX = 0;
                let cropY = 0;
                let cropWidth = width;
                let cropHeight = height;

                if (region) {
                    // ========== 录制 Canvas 裁剪计算 ==========
                    // 将归一化坐标转换为像素坐标
                    // 起点（左上角）：使用 Math.floor 向下取整，确保不包含边界外的像素
                    const rawCropX = region.x * width;
                    const rawCropY = region.y * height;
                    const rawCropWidth = region.width * width;
                    const rawCropHeight = region.height * height;
                    
                    // 起点（左上角）：向右下移动，排除左边框和上边框
                    cropX = Math.max(0, Math.min(width - 1, Math.floor(rawCropX)));
                    cropY = Math.max(0, Math.min(height - 1, Math.floor(rawCropY)));
                    
                    // 终点（右下角）：计算宽度和高度，使用 Math.floor 确保不超出选择区域
                    // 注意：使用 Math.floor 而不是 Math.ceil，确保裁剪区域完全在选择区域内
                    // 这样可以避免包含边界外的像素（如蓝色虚线）
                    cropWidth = Math.max(1, Math.min(width - cropX, Math.floor(rawCropWidth)));
                    cropHeight = Math.max(1, Math.min(height - cropY, Math.floor(rawCropHeight)));
                    
                    console.log('[Hook] ========== 录制裁剪计算详情 ==========');
                    console.log('[Hook] 归一化区域:', region);
                    console.log('[Hook] 视频尺寸:', { width, height });
                    console.log('[Hook] 原始像素坐标:', {
                        rawCropX,
                        rawCropY,
                        rawCropWidth,
                        rawCropHeight
                    });
                    console.log('[Hook] 最终裁剪区域:', {
                        cropX,        // 起点 X（向下取整）
                        cropY,        // 起点 Y（向下取整）
                        cropWidth,    // 宽度（向下取整，确保不超出）
                        cropHeight,   // 高度（向下取整，确保不超出）
                        right: cropX + cropWidth,   // 终点 X
                        bottom: cropY + cropHeight  // 终点 Y
                    });
                }
                // 注意：导出尺寸的处理应该在导出/编码阶段进行，而不是在录制阶段
                // 这样可以确保录制的内容严格按照用户选择的区域，不会包含选择器UI

                // Canvas 尺寸 = 裁剪区域尺寸 * 缩放
                canvas.width = Math.round(cropWidth * optimalScale);
                canvas.height = Math.round(cropHeight * optimalScale);

                // 优化的绘制循环（借鉴 Cap 的帧率控制）
                const interval = 1000 / actualFps;
                let lastDrawTime = 0;
                let isDrawing = true;
                let frameCount = 0;

                const draw = (timestamp: number) => {
                    if (!isDrawing) return;

                    const elapsed = timestamp - lastDrawTime;

                    if (elapsed >= interval) {
                        lastDrawTime = timestamp - (elapsed % interval); // Adjust for drift

                        if (screenVideo.readyState >= 2) {
                            // 按最终裁剪区域绘制到画布（自定义区域或纵横比裁剪）
                            ctx?.drawImage(
                                screenVideo,
                                cropX, cropY, cropWidth, cropHeight,
                                0, 0, canvas.width, canvas.height
                            );
                        }

                        if (cameraVideo && cameraVideo.readyState >= 2) {
                            const currentCamConfig = cameraConfigRef.current; // Read from Ref for live updates!

                            // For Hook MVP, let's implement basic PiP drawing
                            // 使用原始视频尺寸的最小值（宽度或高度）计算摄像头大小（百分比）
                            // 注意：不能使用 canvas 的尺寸，因为 canvas 可能是裁剪后的尺寸
                            // 必须使用原始视频尺寸，与预览时保持一致
                            const originalSize = originalVideoSizeRef.current || { width: canvas.width, height: canvas.height };
                            const originalMinSize = Math.min(originalSize.width, originalSize.height);
                            
                            // 计算摄像头大小（基于原始视频尺寸，像素值）
                            // 这是摄像头在原始视频中的像素大小
                            const camSizeInOriginalVideo = (originalMinSize * (currentCamConfig.width || 15)) / 100;
                            
                            // 重要：canvas 有缩放（optimalScale），并且可能被裁剪
                            // canvas 的尺寸是：cropWidth * optimalScale x cropHeight * optimalScale
                            // 我们需要将摄像头大小从原始视频坐标转换为 canvas 坐标
                            // 缩放比例 = canvas 尺寸 / 原始视频尺寸（考虑裁剪）
                            const cropWidth = recordingRegionRef.current 
                                ? Math.floor(recordingRegionRef.current.width * originalSize.width)
                                : originalSize.width;
                            const cropHeight = recordingRegionRef.current
                                ? Math.floor(recordingRegionRef.current.height * originalSize.height)
                                : originalSize.height;
                            
                            // Canvas 相对于原始视频的缩放比例（考虑裁剪和 optimalScale）
                            const scaleToCanvas = cropWidth > 0 && cropHeight > 0
                                ? Math.min(canvas.width / cropWidth, canvas.height / cropHeight)
                                : 1;
                            
                            // 摄像头在 canvas 上的大小（应用缩放）
                            const camSize = camSizeInOriginalVideo * scaleToCanvas;
                            
                            // 位置计算：百分比转换为像素（基于 canvas 宽度和高度），然后减去 camSize/2 以居中
                            // 注意：位置基于 canvas 的宽度和高度（裁剪后的尺寸），大小基于原始视频尺寸的最小值
                            const camX = (canvas.width * (currentCamConfig.x || 0)) / 100 - camSize / 2;
                            const camY = (canvas.height * (currentCamConfig.y || 0)) / 100 - camSize / 2;

                            // 调试日志：每30帧输出一次（约1秒）

                            ctx?.save();
                            // Circle/Square Logic
                            if (currentCamConfig.shape === 'circle') {
                                // 确保圆形：使用 camSize 作为直径，半径是 camSize/2
                                const radius = camSize / 2;
                                const centerX = camX + camSize / 2;
                                const centerY = camY + camSize / 2;
                                ctx?.beginPath();
                                ctx?.arc(centerX, centerY, radius, 0, Math.PI * 2);
                                ctx?.closePath();
                                ctx?.clip();
                            } else {
                                drawRoundedRect(ctx!, camX, camY, camSize, camSize, 12);
                                ctx?.clip();
                            }

                            // Draw Camera (Cover fit)
                            const vW = cameraVideo.videoWidth;
                            const vH = cameraVideo.videoHeight;
                            const minDim = Math.min(vW, vH);
                            const sx = (vW - minDim) / 2;
                            const sy = (vH - minDim) / 2;

                            // 确保绘制时使用相同的宽高（camSize），保持正方形
                            ctx?.drawImage(cameraVideo, sx, sy, minDim, minDim, camX, camY, camSize, camSize);
                            ctx?.restore();
                        }

                        frameCount++;
                        // 每 30 帧检查一次性能（约 1 秒）
                        if (frameCount % 30 === 0 && frameBufferRef.current) {
                            const stats = frameBufferRef.current.getStats();
                            // 如果丢帧率过高，降低帧率
                            if (stats.dropRate > 10) {
                                const newFps = Math.max(15, actualFps - 5);
                                setTargetFrameRate(newFps);
                                frameBufferRef.current.adjustQueueDepth(newFps);
                            }
                        }
                    }

                    requestAnimationFrame(draw);
                };
                requestAnimationFrame(draw);

                // Add cleanup property to canvas to stop loop
                (canvas as any).stopDrawing = () => { isDrawing = false; };

                finalStream = canvas.captureStream(actualFps);
            } else {
                // --- DIRECT MODE (Optimized) ---
                // Pass the screen stream directly! No Canvas overhead.
                finalStream = displayStream;
            }

            // Add Audio Tracks
            const audioTracks: MediaStreamTrack[] = [];
            
            // System audio tracks
            if (includeSystemAudio && systemAudioStreamRef.current) {
                const sysAudioTracks = systemAudioStreamRef.current.getAudioTracks();
                console.log('[Hook] Adding system audio tracks:', sysAudioTracks.length);
                if (sysAudioTracks.length > 0) {
                    console.log('[Hook] System audio track details:', sysAudioTracks.map(t => ({
                        id: t.id,
                        enabled: t.enabled,
                        readyState: t.readyState,
                        label: t.label
                    })));
                }
                audioTracks.push(...sysAudioTracks);
            } else {
                console.log('[Hook] No system audio tracks (includeSystemAudio:', includeSystemAudio, ', stream exists:', !!systemAudioStreamRef.current, ')');
            }
            
            // Microphone tracks
            if (includeMicrophone && picStream) {
                const micTracks = picStream.getAudioTracks();
                console.log('[Hook] Adding microphone tracks:', micTracks.length);
                audioTracks.push(...micTracks);
            } else {
                console.log('[Hook] No microphone tracks (includeMicrophone:', includeMicrophone, ', stream exists:', !!picStream, ')');
            }
            
            // Display stream audio tracks (if any, and not already included)
            if (!includeCamera) {
                const displayAudioTracks = displayStream.getAudioTracks().filter(t => 
                    !systemAudioStreamRef.current?.getAudioTracks().includes(t)
                );
                if (displayAudioTracks.length > 0) {
                    console.log('[Hook] Adding display stream audio tracks:', displayAudioTracks.length);
                    audioTracks.push(...displayAudioTracks);
                }
            }
            
            const tracks = [
                ...finalStream.getVideoTracks(),
                ...audioTracks
            ];
            const combinedStream = new MediaStream(tracks);
            streamRef.current = combinedStream;
            
            console.log('[Hook] ========== STREAM REF SET DEBUG ==========');
            console.log('[Hook] Stream ref set:', !!streamRef.current);
            console.log('[Hook] Stream active:', streamRef.current?.active);
            console.log('[Hook] Stream tracks:', streamRef.current?.getTracks().length);
            console.log('[Hook] Video tracks:', streamRef.current?.getVideoTracks().length);
            console.log('[Hook] Audio tracks:', streamRef.current?.getAudioTracks().length);
            console.log('[Hook] Audio track details:', streamRef.current?.getAudioTracks().map(t => ({
                id: t.id,
                kind: t.kind,
                enabled: t.enabled,
                readyState: t.readyState,
                label: t.label
            })));
            console.log('[Hook] ========== END STREAM REF SET DEBUG ==========');

            // 5. Initialize Stream to Disk (Electron)
            console.log('[Hook] Step 5: Initializing stream to disk, isElectron:', isElectron);
            if (isElectron) {
                console.log('[Hook] Calling window.electronAPI.startRecordingStream()...');
                try {
                    const res = await window.electronAPI.startRecordingStream();
                    console.log('[Hook] startRecordingStream result:', res);
                    if (!res.success) throw new Error('Failed to start file stream');
                    console.log('[Hook] File stream started successfully');
                } catch (e) {
                    console.error('[Hook] Failed to start file stream:', e);
                    throw e;
                }
            } else {
                console.log('[Hook] Not Electron, skipping file stream initialization');
            }

            // 6. Start MediaRecorder with Optimized Settings
            console.log('[Hook] Step 6: Creating MediaRecorder');
            const mimeType = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'; // Prefer H.264
            const optimalBitrate = PerformanceOptimizer.calculateOptimalBitrate(
                recordingCanvasRef.current?.width || 1920,
                recordingCanvasRef.current?.height || 1080,
                targetFrameRate
            );
            console.log('[Hook] MediaRecorder options:', {
                mimeType,
                optimalBitrate,
                canvasWidth: recordingCanvasRef.current?.width,
                canvasHeight: recordingCanvasRef.current?.height
            });

            const options = {
                mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'video/webm',
                videoBitsPerSecond: optimalBitrate,
                audioBitsPerSecond: 192000, // 192 kbps for high-quality audio (从 128k 提高到 192k)
            };
            console.log('[Hook] Final MediaRecorder options:', options);

            console.log('[Hook] Creating MediaRecorder instance...');
            const mediaRecorder = new MediaRecorder(combinedStream, options);
            console.log('[Hook] MediaRecorder created:', {
                state: mediaRecorder.state,
                mimeType: mediaRecorder.mimeType,
                videoBitsPerSecond: mediaRecorder.videoBitsPerSecond,
                audioBitsPerSecond: mediaRecorder.audioBitsPerSecond
            });
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = async (e) => {
                if (e.data.size > 0 && isElectron) {
                    // 直接写入，MediaRecorder 已经有自己的缓冲
                    // 简化：不使用帧缓冲（MediaRecorder 自己会缓冲）
                    const buffer = await e.data.arrayBuffer();
                    window.electronAPI.writeRecordingChunk(buffer);
                } else if (e.data.size > 0) {
                    // Browser Fallback (accumulate?)
                    // For this hook, let's assume Electron priority. 
                }
            };

            mediaRecorder.onstop = async () => {
                // Cleanup Streams (Moved here for Frozen Fix)
                if (cameraStreamRef.current) {
                    cameraStreamRef.current.getTracks().forEach(t => t.stop());
                    cameraStreamRef.current = null;
                }
                if (displayStreamRef.current) {
                    displayStreamRef.current.getTracks().forEach(t => t.stop());
                    displayStreamRef.current = null;
                }
                if (systemAudioStreamRef.current) {
                    systemAudioStreamRef.current.getTracks().forEach(t => t.stop());
                    systemAudioStreamRef.current = null;
                }
                if (recordingCanvasRef.current && (recordingCanvasRef.current as any).stopDrawing) {
                    (recordingCanvasRef.current as any).stopDrawing();
                    recordingCanvasRef.current = null;
                }

                // Finalize File
                if (isElectron) {
                    setIsExporting(true);
                    setExportProgress(0);
                    // Minimal delay to let UI render loading state
                    await new Promise(r => setTimeout(r, 100));

                    const result = await window.electronAPI.stopRecordingStream(saveFormat);

                    setIsExporting(false);
                    setExportProgress(100);

                    if (result.success) {
                        // Saved!
                    } else if (!result.canceled) {
                        alert('Save failed: ' + result.error);
                    }
                }

                // 清理帧缓冲
                frameBufferRef.current?.clear();
                frameBufferRef.current = null;
                setIsProcessingRef(false);
            };

            console.log('[Hook] Starting MediaRecorder...');
            // 使用更小的 timeslice (250ms) 来确保更精确的时间戳同步，避免长时间录制时音视频不同步
            // 较小的 timeslice 可以减少时间戳累积误差，提高音视频同步精度
            mediaRecorder.start(250); // 250ms chunks for better A/V sync
            console.log('[Hook] MediaRecorder started, setting isRecording to true');
            setIsRecording(true);
            setIsPaused(false);
            console.log('[Hook] ========== RECORDING STARTED ==========');
            console.log('[Hook] streamRef.current:', !!streamRef.current);
            console.log('[Hook] streamRef.current.active:', streamRef.current?.active);
            console.log('[Hook] streamRef.current tracks:', streamRef.current?.getTracks().length);

        } catch (err) {
            console.error('[Hook] ========== RECORDING START FAILED ==========');
            console.error('[Hook] Error:', err);
            console.error('[Hook] Error message:', err instanceof Error ? err.message : String(err));
            console.error('[Hook] Error stack:', err instanceof Error ? err.stack : 'No stack');
            
            // Ensure isRecording is false on error
            setIsRecording(false);
            setIsPaused(false);
            
            // Cleanup streams
            cleanupStreams();
            
            // Clear processing flag
            setIsProcessingRef(false);
            
            alert('Recording Start Failed: ' + (err instanceof Error ? err.message : String(err)));
            console.error('[Hook] ========== END RECORDING START FAILED ==========');
        } finally {
            setIsProcessingRef(false);
            console.log('[Hook] Processing flag cleared');
        }
    };

    // Stream Cleanup Helper
    const cleanupStreams = useCallback(() => {
        if (cameraStreamRef.current) {
            cameraStreamRef.current.getTracks().forEach(t => t.stop());
            cameraStreamRef.current = null;
        }
        if (displayStreamRef.current) {
            displayStreamRef.current.getTracks().forEach(t => t.stop());
            displayStreamRef.current = null;
        }
        if (systemAudioStreamRef.current) {
            systemAudioStreamRef.current.getTracks().forEach(t => t.stop());
            systemAudioStreamRef.current = null;
        }
        if (recordingCanvasRef.current && (recordingCanvasRef.current as any).stopDrawing) {
            (recordingCanvasRef.current as any).stopDrawing();
            recordingCanvasRef.current = null;
        }
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
        frameBufferRef.current?.clear();
        frameBufferRef.current = null;
    }, []);

    // Cleanup on Unmount
    useEffect(() => {
        return () => {
            cleanupStreams();
        };
    }, [cleanupStreams]);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            // Bring to front
            if (typeof window !== 'undefined' && window.electronAPI) {
                window.electronAPI.showMainWindow();
                // 隐藏录制区域虚线框
                if ((window as any).electronAPI.hideRecordingOverlay) {
                    try {
                        (window as any).electronAPI.hideRecordingOverlay();
                    } catch (e) {
                        console.warn('[Hook] Failed to hide recording overlay:', e);
                    }
                }
            }
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            setIsPaused(false);
            // Streams are cleaned up in onstop, but we ensure it happens.
        } else {
            // Force cleanup if not recording (e.g. preview mode leftover)
            cleanupStreams();
        }
    }, [cleanupStreams]);

    // Update stopRecording ref
    useEffect(() => {
        stopRecordingRef.current = stopRecording;
    }, [stopRecording]);

    const pauseRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.pause();
            setIsPaused(true);
        }
    };

    const resumeRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
            mediaRecorderRef.current.resume();
            setIsPaused(false);
        }
    };

    // Setter wrapper for processing reference check?
    const setIsProcessingRef = (val: boolean) => { isProcessingRef.current = val; };

    return {
        isRecording,
        isPaused,
        isExporting, // Export UI State
        exportProgress, // 新增：导出进度
        recordingDuration,
        startRecording,
        stopRecording,
        pauseRecording,
        resumeRecording,
        // Settings Getters/Setters
        settings: {
            includeCamera, setIncludeCamera,
            includeMicrophone, setIncludeMicrophone,
            includeSystemAudio, setIncludeSystemAudio,
            cameraConfig, setCameraConfig,
            saveFormat, setSaveFormat,
            targetFrameRate, setTargetFrameRate,
        },
        // Direct Ref Update for Perf
        updateCameraConfigRef: (cfg: Partial<CameraConfig>) => {
            cameraConfigRef.current = { ...cameraConfigRef.current, ...cfg };
        },
        // Preview Streams (Optional, if UI needs them)
        // For now UI manages its own preview streams mostly, but if we want to share:
        streamRef,
        cameraStreamRef, // 暴露摄像头流，用于录制时显示
        // 暴露原始视频尺寸，用于预览时计算摄像头大小
        originalVideoSize: originalVideoSizeRef.current,
        // 性能统计（可选）
        getPerformanceStats: () => frameBufferRef.current?.getStats(),
    };
};
