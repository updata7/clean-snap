// Use dynamic import for Electron to work with CommonJS
const electron = require('electron');
const { app, BrowserWindow, globalShortcut, ipcMain, screen: electronScreen, nativeImage, clipboard, dialog, shell } = electron;
const path = require('path');
const { writeFile, unlink } = require('fs/promises');
const { createWriteStream } = require('fs');
const fs = require('fs');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');
let ffmpegPath = require('ffmpeg-static');

// Fix for packaged apps
if (ffmpegPath) {
  ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
}

// Try to find ffmpeg in common locations (including pnpm structure)
const possiblePaths = [
  // Standard node_modules location
  path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
  path.join(__dirname, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
  // pnpm location
  path.join(process.cwd(), 'node_modules', '.pnpm', 'ffmpeg-static@5.3.0', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
];

// Verify FFmpeg path exists and handle pnpm structure
if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
  console.warn('[MAIN] FFmpeg path from ffmpeg-static not found:', ffmpegPath);
  
  // Try to resolve from require
  try {
    possiblePaths.push(require.resolve('ffmpeg-static/ffmpeg.exe'));
  } catch (e) {
    // Ignore
  }
  
  for (const possiblePath of possiblePaths) {
    if (possiblePath && fs.existsSync(possiblePath)) {
      ffmpegPath = possiblePath;
      console.log('[MAIN] FFmpeg path found at:', ffmpegPath);
      break;
    }
  }
  
  // If still not found, try to get the directory and look for ffmpeg.exe
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    try {
      const ffmpegStaticPath = require.resolve('ffmpeg-static/package.json');
      const ffmpegDir = path.dirname(ffmpegStaticPath);
      const ffmpegExe = path.join(ffmpegDir, 'ffmpeg.exe');
      if (fs.existsSync(ffmpegExe)) {
        ffmpegPath = ffmpegExe;
        console.log('[MAIN] FFmpeg path found via package.json:', ffmpegPath);
      }
    } catch (e) {
      console.warn('[MAIN] Could not resolve ffmpeg-static package.json:', e);
    }
  }
}

// Set FFmpeg path
if (ffmpegPath && fs.existsSync(ffmpegPath)) {
ffmpeg.setFfmpegPath(ffmpegPath);
  console.log('[MAIN] FFmpeg path set to:', ffmpegPath);
} else {
  console.error('[MAIN] FFmpeg executable not found!');
  console.error('[MAIN] Please ensure ffmpeg-static is properly installed: pnpm install ffmpeg-static');
  console.error('[MAIN] Attempted paths:', possiblePaths);
}

// Auto Updater (only in production)
let autoUpdater;
if (!app.isPackaged) {
  // In development, use a mock updater
  autoUpdater = null;
} else {
  try {
    autoUpdater = require('electron-updater').autoUpdater;
    // Configure update server (replace with your actual update server)
    // autoUpdater.setFeedURL({
    //   provider: 'github',
    //   owner: 'your-username',
    //   repo: 'cleansnap-web'
    // });
    // Or use a custom server:
    // autoUpdater.setFeedURL('https://updates.cleansnap.app');
  } catch (e) {
    console.warn('electron-updater not available:', e);
    autoUpdater = null;
  }
}

// Get app version
const appVersion = app.getVersion() || require('../package.json').version || '1.0.0';

// Simple daily log file in project-local logs directory
let logStream: any = null;
let currentLogDate = '';

function getDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function initLogger() {
  try {
    // 在开发模式下，将日志写到项目目录的 ../logs 下；
    // 在打包后，也保持同样相对位置，方便统一查看
    const logsDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    function writeToFile(level: 'LOG' | 'WARN' | 'ERROR', args: any[]) {
      try {
        const dateStr = getDateString();
        if (!logStream || currentLogDate !== dateStr) {
          // rotate daily
          currentLogDate = dateStr;
          if (logStream) {
            logStream.end();
          }
          const filePath = path.join(logsDir, `${dateStr}.log`);
          logStream = fs.createWriteStream(filePath, { flags: 'a' });
        }

        const now = new Date();
        const time = now.toISOString();
        const line =
          `[${time}] [${level}] ` +
          args
            .map((a) => {
              if (a instanceof Error) return a.stack || a.message;
              if (typeof a === 'string') return a;
              try {
                return JSON.stringify(a);
              } catch {
                return String(a);
              }
            })
            .join(' ') +
          '\n';
        logStream.write(line);
      } catch {
        // do not throw from logger
      }
    }

    console.log = (...args: any[]) => {
      writeToFile('LOG', args);
      origLog.apply(console, args);
    };
    console.warn = (...args: any[]) => {
      writeToFile('WARN', args);
      origWarn.apply(console, args);
    };
    console.error = (...args: any[]) => {
      writeToFile('ERROR', args);
      origError.apply(console, args);
    };

    // Also capture process-level errors
    process.on('uncaughtException', (err: any) => {
      console.error('[UNCAUGHT_EXCEPTION]', err);
    });
    process.on('unhandledRejection', (reason: any) => {
      console.error('[UNHANDLED_REJECTION]', reason);
    });

    console.log('[LOGGER] Initialized. Logs directory:', logsDir);
  } catch (e) {
    // If logger fails, just print to console
    console.error('[LOGGER] Failed to initialize:', e);
  }
}

// Performance detection (借鉴 Cap 的思路)
function getPerformanceTier() {
  const cores = os.cpus().length;
  if (cores < 4) return 'low';
  if (cores < 8) return 'medium';
  return 'high';
}

function getRecommendedPreset() {
  // 最优质量：使用最慢但质量最好的 preset
  // ultrafast < veryfast < faster < fast < medium < slow < slower < veryslow
  // 为了获得最高质量，使用 medium 或 slow preset
  if (process.platform === 'darwin') {
    return 'medium';  // macOS 上使用 medium（质量最优）
  }

  const tier = getPerformanceTier();
  switch (tier) {
    case 'low': return 'fast';  // 低端设备使用 fast（平衡质量和速度）
    case 'medium': return 'medium';  // 中端设备使用 medium（最高质量）
    case 'high': return 'slow';  // 高端设备使用 slow（质量最优，但编码最慢）
  }
}

function getRecommendedCRF() {
  // 最优质量：使用最低的 CRF 值以获得最高清晰度
  // CRF 16-18: 接近无损质量，18-20: 高质量，20-23: 中等质量
  // 为了获得最清晰的视频，使用接近无损的 CRF 值
  if (process.platform === 'darwin') {
    return 18;  // macOS 上使用最高质量（CRF 18，接近无损）
  }

  const tier = getPerformanceTier();
  switch (tier) {
    case 'low': return 20;  // 高质量（CRF 20）
    case 'medium': return 18;  // 最高质量（CRF 18，接近无损）
    case 'high': return 16;  // 接近无损质量（CRF 16）
  }
}

// Streaming State
let recordingWriteStream = null;
let recordingTempPath = null;

ipcMain.handle('start-recording-stream', async (event) => {
  try {
    const tempInput = path.join(os.tmpdir(), `stream-recording-${Date.now()}.webm`);
    recordingTempPath = tempInput;
    recordingWriteStream = createWriteStream(tempInput);
    console.log('[MAIN] Started recording stream to:', tempInput);
    return { success: true, path: tempInput };
  } catch (err) {
    console.error('[MAIN] Failed to start stream:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('write-recording-chunk', async (event, buffer) => {
  if (recordingWriteStream) {
    try {
      recordingWriteStream.write(Buffer.from(buffer));
      return true;
    } catch (err) {
      console.error('[MAIN] Write chunk error:', err);
      return false;
    }
  }
  return false;
});

ipcMain.handle('stop-recording-stream', async (event, format) => {
  console.log('[MAIN] Stopping recording stream...');

  if (!recordingWriteStream) {
    return { success: false, error: 'No active stream' };
  }

  // Close the stream safely
  await new Promise((resolve) => {
    recordingWriteStream.end(resolve);
  });
  recordingWriteStream = null;

  const tempInput = recordingTempPath;
  if (!tempInput) return { success: false, error: 'No temp file path' };

  // Prompt save dialog
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: format.toUpperCase(), extensions: [format] }],
    defaultPath: `recording-${Date.now()}.${format}`
  });

  if (canceled || !filePath) {
    // Cleanup if cancelled
    try { await unlink(tempInput); } catch (e) { }
    return { success: false, canceled: true };
  }

  try {
    const fs = require('fs');
    
    // 获取输入文件信息用于进度计算
    let inputDuration = 0;
    let inputSize = 0;
    try {
      const stats = await fs.promises.stat(tempInput);
      inputSize = stats.size;
      
      // 尝试获取视频时长（用于更准确的进度）
      await new Promise((resolve) => {
        ffmpeg.ffprobe(tempInput, (err, metadata) => {
          if (!err && metadata?.format?.duration) {
            inputDuration = metadata.format.duration;
          }
          resolve(null);
        });
      });
    } catch (e) {
      console.warn('[MAIN] Failed to get input file info:', e);
    }

    // 发送初始进度
    event.sender.send('export-progress', 5);

    // Process the streamed file (tempInput) to destination (filePath)
    // 优化的编码处理（借鉴 Cap 的编码参数）
    if (format === 'gif') {
      // GIF Conversion with optimized settings
      await new Promise((resolve, reject) => {
        const command = ffmpeg(tempInput)
          .outputOptions([
            '-vf', 'fps=15,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
            '-loop', '0'
          ])
          .toFormat('gif');

        // 改进的进度追踪：基于时间和文件大小
        let lastProgress = 5;
        const progressInterval = setInterval(() => {
          if (lastProgress < 90) {
            lastProgress += 5;
            event.sender.send('export-progress', lastProgress);
          }
        }, 500); // 每 500ms 更新一次

        command.on('progress', (progress) => {
          if (progress.percent !== undefined) {
            const percent = Math.min(95, Math.max(5, progress.percent));
            lastProgress = percent;
            event.sender.send('export-progress', percent);
          } else if (progress.timemark && inputDuration > 0) {
            // 基于时间计算进度
            const timeMatch = progress.timemark.match(/(\d+):(\d+):(\d+\.\d+)/);
            if (timeMatch) {
              const hours = parseInt(timeMatch[1]);
              const minutes = parseInt(timeMatch[2]);
              const seconds = parseFloat(timeMatch[3]);
              const currentTime = hours * 3600 + minutes * 60 + seconds;
              const percent = Math.min(95, Math.max(5, (currentTime / inputDuration) * 100));
              lastProgress = percent;
              event.sender.send('export-progress', percent);
            }
          }
        });

        command
          .save(filePath)
          .on('end', () => {
            clearInterval(progressInterval);
            event.sender.send('export-progress', 100);
            resolve(null);
          })
          .on('error', (err) => {
            clearInterval(progressInterval);
            reject(err);
          });
      });
    } else {
      // MP4 Processing with optimized encoding (借鉴 Cap)
      // 最优方案：如果输入是 WebM 且用户选择保存为 WebM，直接复制（最快）
      if (filePath.endsWith('.webm') && tempInput.endsWith('.webm')) {
        console.log('[MAIN] Input and output are both WebM, directly copying (fastest)');
        event.sender.send('export-progress', 50);
        await fs.promises.copyFile(tempInput, filePath);
        event.sender.send('export-progress', 100);
      } else if (filePath.endsWith('.mp4')) {
        // 先检查输入格式（同步获取，避免异步问题）
        let useStreamCopy = false;
        let actualDuration = inputDuration;
        let probeMetadata: any = null;
        
        await new Promise((resolveProbe) => {
          ffmpeg.ffprobe(tempInput, (err, metadata) => {
            if (!err && metadata?.streams) {
              probeMetadata = metadata; // 保存 metadata 供后续使用
              const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
              const audioStream = metadata.streams.find((s: any) => s.codec_type === 'audio');
              
              // 更新实际时长
              if (metadata.format?.duration) {
                actualDuration = metadata.format.duration;
              }
              
              // 优化：尽可能使用 stream copy
              // 1. 如果已经是 H.264 和 AAC，直接 stream copy（最快）
              // 2. 如果视频是 H.264，音频是 AAC 或兼容格式，也可以 stream copy
              const videoCodec = videoStream?.codec_name?.toLowerCase();
              const audioCodec = audioStream?.codec_name?.toLowerCase();
              
              const containerFormat = metadata.format?.format_name?.toLowerCase() || '';
              
              console.log('[MAIN] ========== INPUT FILE ANALYSIS ==========');
              console.log('[MAIN] Container format:', containerFormat);
              console.log('[MAIN] Video codec:', videoCodec || 'unknown');
              console.log('[MAIN] Audio codec:', audioCodec || 'none');
              console.log('[MAIN] Duration:', actualDuration, 's');
              console.log('[MAIN] ==========================================');
              
              if (videoCodec === 'h264' && (audioCodec === 'aac' || audioCodec === 'mp3' || !audioCodec)) {
                useStreamCopy = true;
                console.log('[MAIN] ✅ Input is H.264 with compatible audio, using stream copy (very fast)');
              } else {
                console.log('[MAIN] ⚠️ Input codec:', videoCodec || 'unknown', audioCodec || 'unknown', '- will re-encode');
                console.log('[MAIN] ⚠️ This will be slower. For fastest export, save as WebM format.');
              }
            }
            resolveProbe(null);
          });
        });

        // 现在执行编码
        await new Promise((resolve, reject) => {
          const preset = getRecommendedPreset();
          const crf = getRecommendedCRF();
          
          const command = ffmpeg(tempInput);
          
          if (useStreamCopy) {
            // 使用 stream copy（极快，几乎瞬间完成）
            // 即使使用 stream copy，也添加音视频同步参数以确保长时间录制时的同步
            command
              .outputOptions([
                '-c', 'copy',  // 直接复制流，不重新编码
                '-movflags', '+faststart',
                '-async', '1',  // 音视频同步：修复长时间录制时的不同步问题
                '-vsync', 'cfr'  // 强制恒定帧率，确保音视频同步
              ]);
          } else {
            // 重新编码（优化参数 - 优先速度）
            // 使用之前保存的 metadata
            const videoStream = probeMetadata?.streams?.find((s: any) => s.codec_type === 'video');
            const audioStream = probeMetadata?.streams?.find((s: any) => s.codec_type === 'audio');
            const videoCodec = videoStream?.codec_name?.toLowerCase();
            const audioCodec = audioStream?.codec_name?.toLowerCase();
            
            console.log('[MAIN] ⚠️ Re-encoding required (this will take time)');
            console.log('[MAIN] Re-encoding with preset:', preset, 'CRF:', crf, 'Duration:', actualDuration, 's');
            console.log('[MAIN] Input video codec:', videoCodec || 'unknown', '-> Output: H.264');
            console.log('[MAIN] Input audio codec:', audioCodec || 'unknown', '-> Output: AAC');
            
            const outputOptions: string[] = [];
            
            // 视频编码：如果已经是 H.264，尝试 stream copy；否则重新编码
            if (videoCodec === 'h264') {
              outputOptions.push('-c:v', 'copy');  // 视频 stream copy
              console.log('[MAIN] Video is H.264, using stream copy for video (faster)');
            } else {
              outputOptions.push(
                '-c:v', 'libx264',
                '-preset', preset,  // medium/slow - 最优质量
                '-crf', crf.toString(),  // 16-20 - 接近无损质量
                '-profile:v', 'high',  // 使用 high profile 以获得最好的质量和兼容性
                '-level', '4.2',  // H.264 level 4.2，支持更高分辨率和比特率
                '-pix_fmt', 'yuv420p',  // 确保兼容性
                '-threads', '0',  // 使用所有可用线程
                '-tune', 'film',  // 使用 film tune 以获得最佳视频质量
                '-x264-params', 'keyint=250:min-keyint=25:scenecut=60:ref=6:bframes=6:me=umh:subme=9:merange=24:trellis=2:aq-mode=2:aq-strength=1.0'  // 最优质量参数：
                // keyint=250: 更长的关键帧间隔（更好的压缩效率）
                // min-keyint=25: 最小关键帧间隔
                // scenecut=60: 更强的场景检测
                // ref=6: 更多参考帧（提高质量）
                // bframes=6: 更多B帧（更好的压缩）
                // me=umh: 使用更高级的运动估计算法
                // subme=9: 最高质量的子像素运动估计
                // merange=24: 更大的运动搜索范围
                // trellis=2: 启用 trellis 量化（提高质量）
                // aq-mode=2: 自适应量化模式
                // aq-strength=1.0: 自适应量化强度
              );
            }
            
            // 音频编码：如果已经是 AAC，尝试 stream copy；否则重新编码
            if (audioCodec === 'aac' || audioCodec === 'mp3') {
              outputOptions.push('-c:a', 'copy');  // 音频 stream copy
              console.log('[MAIN] Audio is compatible, using stream copy for audio (faster)');
            } else {
              outputOptions.push(
                '-c:a', 'aac',
                '-b:a', '192k',  // 提高音频比特率到 192kbps（从 128k 提高到 192k，更高质量）
                '-ar', '48000',  // 确保音频采样率为 48kHz，与录制时一致
                '-ac', '2'       // 立体声，与录制时一致
              );
            }
            
            outputOptions.push('-movflags', '+faststart');  // 优化流式播放
            // 音视频同步：使用多个参数确保音视频完全同步
            // -async 1: 音频同步到视频，自动调整音频速度以匹配视频时间戳
            // -vsync cfr: 强制恒定帧率，确保视频帧时间戳准确
            // -r: 设置输出帧率，与录制帧率一致
            outputOptions.push(
              '-async', '1',
              '-vsync', 'cfr',
              '-r', '30'  // 确保输出帧率恒定
            );
            
            command.outputOptions(outputOptions);
          }
          
          command.toFormat('mp4');

          // 改进的进度追踪 - 确保总是有进度更新
          let lastProgress = 10;
          let startTime = Date.now();
          let progressInterval: NodeJS.Timeout | null = null;
          
          // 立即发送初始进度
          event.sender.send('export-progress', 10);
          
          // 设置进度更新间隔（fallback）
          progressInterval = setInterval(() => {
            if (useStreamCopy) {
              // Stream copy 很快，直接跳到 95%
              if (lastProgress < 95) {
                lastProgress = 95;
                event.sender.send('export-progress', 95);
              }
            } else {
              // 基于时间估算进度（fallback）
              const elapsed = (Date.now() - startTime) / 1000; // 秒
              // 假设编码速度：低端设备 0.3x，中端 0.7x，高端 1.2x
              const tier = getPerformanceTier();
              const speedFactor = tier === 'low' ? 0.3 : tier === 'medium' ? 0.7 : 1.2;
              const estimatedTotal = actualDuration > 0 ? actualDuration / speedFactor : Math.max(5, actualDuration || 10); // 至少 5 秒
              const timeBasedProgress = Math.min(90, Math.max(10, (elapsed / estimatedTotal) * 100));
              
              if (timeBasedProgress > lastProgress) {
                lastProgress = timeBasedProgress;
                event.sender.send('export-progress', Math.round(lastProgress));
              } else if (lastProgress < 50) {
                // 即使没有更新，也缓慢增加（防止卡在 0）
                lastProgress += 3;
                event.sender.send('export-progress', Math.round(lastProgress));
              }
            }
          }, 300); // 每 300ms 更新一次

          command.on('progress', (progress) => {
            console.log('[MAIN] FFmpeg progress:', progress);
            if (progress.percent !== undefined) {
              const percent = Math.min(95, Math.max(10, progress.percent));
              lastProgress = percent;
              event.sender.send('export-progress', Math.round(percent));
            } else if (progress.timemark && actualDuration > 0) {
              // 基于时间计算进度
              const timeMatch = progress.timemark.match(/(\d+):(\d+):(\d+\.\d+)/);
              if (timeMatch) {
                const hours = parseInt(timeMatch[1]);
                const minutes = parseInt(timeMatch[2]);
                const seconds = parseFloat(timeMatch[3]);
                const currentTime = hours * 3600 + minutes * 60 + seconds;
                const percent = Math.min(95, Math.max(10, (currentTime / actualDuration) * 100));
                lastProgress = percent;
                event.sender.send('export-progress', Math.round(percent));
              }
            }
          });

          command
            .save(filePath)
            .on('start', (commandLine) => {
              console.log('[MAIN] FFmpeg command:', commandLine);
              startTime = Date.now();
              event.sender.send('export-progress', 15);
            })
            .on('end', () => {
              if (progressInterval) clearInterval(progressInterval);
              event.sender.send('export-progress', 100);
              console.log('[MAIN] Export completed');
              resolve(null);
            })
            .on('error', (err) => {
              if (progressInterval) clearInterval(progressInterval);
              console.error('[MAIN] FFmpeg error:', err);
              reject(err);
            });
        });
      } else {
        // Just copy/move if WebM
        event.sender.send('export-progress', 50);
        await fs.promises.copyFile(tempInput, filePath);
        event.sender.send('export-progress', 100);
      }
    }

    // Cleanup temp
    await unlink(tempInput);
    return { success: true, path: filePath };

  } catch (err) {
    console.error('Save recording error:', err);
    return { success: false, error: err.message };
  }
});


let mainWindow: typeof BrowserWindow.prototype | null = null;
let selectorWindow: typeof BrowserWindow.prototype | null = null;
let previewWindow: typeof BrowserWindow.prototype | null = null;
let recordingOverlayWindow: typeof BrowserWindow.prototype | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// 启用 H.264 编码支持（如果 Chromium 版本支持）
// 注意：这需要 Chromium 100+ 版本，且某些构建可能不包含 H.264 编码器
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');
// 尝试启用硬件加速的 H.264 编码（如果可用）
app.commandLine.appendSwitch('enable-accelerated-video-encode');
// 防止后台窗口被节流（解决窗口录制卡顿问题）
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

// 抑制 EGL/OpenGL 相关的错误日志（这些错误通常不影响功能）
// 这些错误通常是因为 Chromium 查询某些 GPU 属性时，macOS 驱动不支持某些扩展
// 注意：这些是警告性错误，不会影响应用功能，可以安全忽略
// 如果仍然看到这些错误，它们是 Chromium 内部的，不影响 MP4 录制功能

// 使用 log-level=3 只输出 FATAL 错误，隐藏 ERROR/WARNING (包括 EGL Driver message)
// 注意：WGC ProcessFrame 错误 (-2147467259) 是警告性的，不影响录制功能
// 系统会自动使用上一帧继续录制，这些错误可以安全忽略
app.commandLine.appendSwitch('log-level', '3');

function createMainWindow() {
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 680,
    height: 580,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      enableBlinkFeatures: 'MediaDevices',
      backgroundThrottling: false,
    },
    show: false,
    frame: !isMac, // macOS 使用原生标题栏更美观
    transparent: !isMac, // macOS 不需要透明窗口
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden', // macOS 使用 inset 样式
    vibrancy: isMac ? 'fullscreen-ui' : undefined, // macOS 毛玻璃效果
  });

  // 调试主窗口可见性相关事件
  mainWindow.on('minimize', () => {
    // Window minimized
  });
  mainWindow.on('restore', () => {
    // Window restored
  });
  mainWindow.on('hide', () => {
    console.log('[MAIN] mainWindow hidden');
  });
  mainWindow.on('show', () => {
    // Window shown
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Register global shortcut (Global means it works even when app is not focused)
  // We register it once when window is created.
  // Using Alt+Cmd+S to avoid conflicts with common system shortcuts
  // Global Shortcut for Stop Recording
  // Alt+S is often reserved or produces special chars on Mac (ß).
  // Reverting to CommandOrControl+Alt+S for reliability.
  const ret = globalShortcut.register('CommandOrControl+Alt+S', () => {
    mainWindow?.webContents.send('global-shortcut', 'toggle-recording');
  });

  if (!ret) {
    console.log('Global shortcut registration failed');
  }

  // Ensure we unregister when window is closed (though app.will-quit handles unregisterAll usually)
  mainWindow.on('closed', () => {
    mainWindow = null;
    // We don't necessarily unregister here if we want it to work with closed window? 
    // But if mainWindow is null, we can't send message. 
    // So for this app, if window is closed, we probably stop recording.
  });


  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 捕获渲染进程的 console 日志并写入文件（通过 IPC）
  // 注意：console-message 事件在某些 Electron 版本中可能不可用，所以使用 IPC

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    
    // 检查屏幕录制权限（仅 Windows）
    if (process.platform === 'win32') {
      checkScreenRecordingPermission();
    }
  });
}

// 检查屏幕录制权限
async function checkScreenRecordingPermission() {
  try {
    const { desktopCapturer } = electron;
    console.log('[MAIN] Checking screen recording permission...');
    
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 100, height: 100 }, // 小尺寸，仅用于检查
    });
    
    const screenSources = sources.filter((s: any) => s.id.startsWith('screen:'));
    const windowSources = sources.filter((s: any) => !s.id.startsWith('screen:'));
    
    console.log(`[MAIN] Permission check: ${sources.length} sources found (${screenSources.length} screens, ${windowSources.length} windows)`);
    
    // 如果没有窗口源，可能是权限问题
    // Windows 上，即使没有权限，通常也能获取到屏幕源，但获取不到窗口源
    // 如果连屏幕源都没有，肯定是权限问题
    if (sources.length === 0 || (screenSources.length === 0 && windowSources.length === 0)) {
      console.log('[MAIN] Screen recording permission appears to be missing');
      mainWindow?.webContents.send('screen-recording-permission-missing');
      return false;
    }
    
    // 如果只有屏幕源，没有窗口源，也可能是权限不足（部分权限）
    if (screenSources.length > 0 && windowSources.length === 0) {
      console.log('[MAIN] Partial permission: screens available but no windows (may need full permission)');
      // 仍然发送提示，但标记为部分权限
      mainWindow?.webContents.send('screen-recording-permission-partial');
      return false;
    }
    
    console.log('[MAIN] Screen recording permission OK');
    return true;
  } catch (error) {
    console.error('[MAIN] Error checking screen recording permission:', error);
    mainWindow?.webContents.send('screen-recording-permission-missing');
    return false;
  }
}

function createSelectorWindow() {
  console.log('[Main] createSelectorWindow called');
  
  // 最小化主窗口，让选择器窗口显示在最前面
  if (mainWindow && !mainWindow.isMinimized()) {
    console.log('[Main] Minimizing main window for area selector');
    mainWindow.minimize();
  }
  
  const displays = electronScreen.getAllDisplays();
  const primaryDisplay = electronScreen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  console.log('[Main] Display size:', width, 'x', height);

  selectorWindow = new BrowserWindow({
    width: width,
    height: height,
    x: primaryDisplay.bounds.x,
    y: primaryDisplay.bounds.y,
    frame: false,
    transparent: true,  // 透明窗口，让系统/其它应用内容可见
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const url = isDev ? 'http://localhost:3000/selector.html' : path.join(__dirname, '../dist/selector.html');
  console.log('[Main] Loading selector from:', url);

  if (isDev) {
    selectorWindow.loadURL(url);
  } else {
    selectorWindow.loadFile(url);
  }

  selectorWindow.webContents.on('did-finish-load', () => {
    console.log('[Main] Selector window loaded successfully');
  });

  selectorWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[Main] Selector window failed to load:', errorCode, errorDescription);
  });

  selectorWindow.setIgnoreMouseEvents(false, { forward: true });
  selectorWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  selectorWindow.on('closed', () => {
    console.log('[Main] Selector window closed');
    selectorWindow = null;
  });
}

function createPreviewWindow(imagePath: string) {
  if (previewWindow) {
    previewWindow.close();
  }

  previewWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    previewWindow.loadURL(`http://localhost:3000/preview.html?imagePath=${encodeURIComponent(imagePath)}`);
  } else {
    previewWindow.loadFile(path.join(__dirname, '../dist/preview.html'), {
      query: { imagePath },
    });
  }

  previewWindow.on('closed', () => {
    previewWindow = null;
  });
}

app.whenReady().then(() => {
  // 初始化日志系统（每日一个日志文件，位于 userData/logs）
  initLogger();

  createMainWindow();

  // Auto-check for updates on startup (only in production, and only once per day)
  if (autoUpdater && app.isPackaged) {
    // Use Electron's app.getPath('userData') for storing last check time
    const userDataPath = app.getPath('userData');
    const fs = require('fs');
    const path = require('path');
    const lastCheckFile = path.join(userDataPath, 'last-update-check.json');
    
    let lastUpdateCheck: number | null = null;
    try {
      if (fs.existsSync(lastCheckFile)) {
        const data = JSON.parse(fs.readFileSync(lastCheckFile, 'utf-8'));
        lastUpdateCheck = data.timestamp || null;
      }
    } catch (e) {
      // Ignore
    }
    
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    if (!lastUpdateCheck || (now - lastUpdateCheck) > oneDay) {
      // Check for updates silently in background
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch((err) => {
          console.log('Background update check failed:', err);
        });
        // Save last check time
        try {
          fs.writeFileSync(lastCheckFile, JSON.stringify({ timestamp: now }), 'utf-8');
        } catch (e) {
          // Ignore
        }
      }, 5000); // Wait 5 seconds after app start
    }
  }

  // Register global shortcuts
  // CommandOrControl automatically uses Cmd on macOS and Ctrl on Windows/Linux
  globalShortcut.register('CommandOrControl+Shift+3', async () => {
    const image = await captureFullScreen();
    mainWindow?.webContents.send('screenshot-captured', image);
  });

  globalShortcut.register('CommandOrControl+Shift+4', async () => {
    const image = await captureArea();
    if (image) mainWindow?.webContents.send('screenshot-captured', image);
  });

  globalShortcut.register('CommandOrControl+Shift+5', async () => {
    const image = await captureWindow();
    if (image) mainWindow?.webContents.send('screenshot-captured', image);
  });

  // macOS specific: handle dock icon click
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      // Bring existing window to front on macOS
      mainWindow?.show();
    }
  });
});

ipcMain.handle('show-main-window', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    // macOS specific: ensures app comes to front even if another app was active
    if (process.platform === 'darwin') {
      app.dock.show();
    }
  }
});

app.on('window-all-closed', () => {
  // On macOS, apps typically stay active even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
  // On macOS, we keep the app running (don't quit)
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// IPC Handlers
ipcMain.handle('capture-fullscreen', async () => {
  return await captureFullScreen();
});

ipcMain.handle('capture-area', async () => {
  return await captureArea();
});

ipcMain.handle('capture-window', async () => {
  return await captureWindow();
});

ipcMain.handle('capture-selection', async (_event: any, bounds: { x: number; y: number; width: number; height: number }) => {
  return await captureSelection(bounds);
});

ipcMain.handle('get-screens', () => {
  return electronScreen.getAllDisplays().map((display: any) => ({
    id: display.id,
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor,
  }));
});

// 接收渲染进程的日志并写入文件
ipcMain.on('renderer-log', (event, level: 'log' | 'warn' | 'error', ...args: any[]) => {
  const levelMap: { [key: string]: 'LOG' | 'WARN' | 'ERROR' } = {
    'log': 'LOG',
    'warn': 'WARN',
    'error': 'ERROR'
  };
  const logLevel = levelMap[level] || 'LOG';
  const message = args.map((a) => {
    if (a instanceof Error) return a.stack || a.message;
    if (typeof a === 'string') return a;
    try {
      return JSON.stringify(a);
    } catch {
      return String(a);
    }
  }).join(' ');
  // 使用主进程的 console，这样会自动写入日志文件
  console[level](`[RENDERER] ${message}`);
});

ipcMain.handle('get-desktop-sources', async () => {
  try {
    const { desktopCapturer } = electron;
    console.log('[MAIN] Fetching desktop sources...');
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 500, height: 500 }, // Optimize thumbnail size for UI
      fetchWindowIcons: true
    });

    console.log(`[MAIN] Found ${sources.length} sources total`);
    console.log(`[MAIN] Screen sources: ${sources.filter(s => s.id.startsWith('screen:')).length}`);
    console.log(`[MAIN] Window sources: ${sources.filter(s => !s.id.startsWith('screen:')).length}`);

    // Log first few window names to debug visibility
    const windows = sources.filter(s => !s.id.startsWith('screen:'));
    if (windows.length > 0) {
      console.log('[MAIN] First 5 windows:', windows.slice(0, 5).map(w => w.name));
    } else {
      console.log('[MAIN] No windows found. Check Screen Recording permissions.');
      // 在 Windows 上，如果没有窗口源，可能是权限问题
      if (process.platform === 'win32') {
        console.log('[MAIN] ========== PERMISSION CHECK ==========');
        console.log('[MAIN] Windows Screen Recording Permission may be missing.');
        console.log('[MAIN] Please check: Settings > Privacy > Screen recording');
        console.log('[MAIN] Make sure Electron app has permission.');
        console.log('[MAIN] ======================================');
      }
    }

    // Return all sources, user will filter in UI
    const result = sources.map((source: any) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
    }));

    return result;
  } catch (error) {
    console.error('[MAIN] Error getting desktop sources:', error);
    // 如果是权限错误，提供更详细的提示
    if (process.platform === 'win32' && error instanceof Error) {
      console.error('[MAIN] This might be a permission issue.');
      console.error('[MAIN] Please check Windows Settings > Privacy > Screen recording');
    }
    return [];
  }
});

ipcMain.handle('save-image', async (_event: any, imageData: string, filename?: string) => {
  try {
    const timestamp = Date.now();
    const defaultFilename = filename || `cleansnap-${timestamp}.png`;

    // Show save dialog
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Save Image',
      defaultPath: defaultFilename,
      filters: [
        { name: 'PNG Images', extensions: ['png'] },
        { name: 'JPEG Images', extensions: ['jpg', 'jpeg'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      buttonLabel: 'Save',
    });

    // User cancelled the dialog
    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    const filePath = result.filePath;

    // Determine file format from extension
    const ext = path.extname(filePath).toLowerCase();
    let format = 'png';
    if (ext === '.jpg' || ext === '.jpeg') {
      format = 'jpeg';
    }

    // Remove data URL prefix
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // If format is JPEG, we need to convert from PNG to JPEG
    // For now, we'll save as PNG regardless of extension
    // In a full implementation, you'd use a library like sharp to convert formats
    await writeFile(filePath, buffer);

    return { success: true, path: filePath };
  } catch (error) {
    console.error('Save error:', error);
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('copy-to-clipboard', async (_event: any, imageData: string) => {
  try {
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const image = nativeImage.createFromBuffer(buffer);
    clipboard.writeImage(image);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('close-selector', () => {
  if (selectorWindow) {
    selectorWindow.close();
  }
});

ipcMain.handle('show-preview', (_event: any, imageData: string) => {
  // For now, send to main window
  mainWindow?.webContents.send('preview-image', imageData);
});

ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win?.setIgnoreMouseEvents(ignore, options);
});

ipcMain.on('show-window', () => {
  mainWindow?.show();
});

ipcMain.on('minimize-window', () => {
  mainWindow?.minimize();
});

ipcMain.on('create-area-selector', () => {
  console.log('[Main] create-area-selector called');
  if (selectorWindow) {
    console.log('[Main] Selector window already exists, focusing');
    selectorWindow.focus();
    return;
  }
  console.log('[Main] Creating new selector window');
  createSelectorWindow();
});

ipcMain.on('area-selected', (event, bounds) => {
  console.log('[Main] area-selected received:', bounds);
  // 先关闭选择器窗口，确保不会录制到窗口UI
  if (selectorWindow) {
    const windowToClose = selectorWindow;
    selectorWindow = null;
    
    // 使用窗口的 'closed' 事件确保窗口真正关闭后再发送结果
    windowToClose.once('closed', () => {
      console.log('[Main] Selector window fully closed, waiting additional time for rendering cleanup');
      // 窗口关闭后，再等待一段时间确保渲染完全清理
      setTimeout(() => {
        console.log('[Main] Sending area-selection-result after window fully closed');
        // 恢复主窗口（如果之前被最小化了）
        if (mainWindow && mainWindow.isMinimized()) {
          console.log('[Main] Restoring main window after area selection');
          mainWindow.restore();
        }
        mainWindow?.webContents.send('area-selection-result', bounds);
      }, 300);
    });
    
    windowToClose.close();
    console.log('[Main] Selector window close() called');
  } else {
    // 如果窗口已经不存在，直接发送结果
    console.log('[Main] Selector window already closed, sending result immediately');
    // 恢复主窗口（如果之前被最小化了）
    if (mainWindow && mainWindow.isMinimized()) {
      console.log('[Main] Restoring main window after area selection (window already closed)');
      mainWindow.restore();
    }
    mainWindow?.webContents.send('area-selection-result', bounds);
  }
});

ipcMain.on('cancel-area-selection', () => {
  console.log('[Main] cancel-area-selection called');
  if (selectorWindow) {
    selectorWindow.close();
    selectorWindow = null;
  }
  // 恢复主窗口（如果之前被最小化了）
  if (mainWindow && mainWindow.isMinimized()) {
    console.log('[Main] Restoring main window after canceling area selection');
    mainWindow.restore();
  }
  mainWindow?.webContents.send('area-selection-result', null);
});

// 显示/隐藏录制区域虚线框（录制中 Overlay）
ipcMain.handle('show-recording-overlay', (_event, bounds: { x: number; y: number; width: number; height: number }) => {
  try {
    if (recordingOverlayWindow) {
      recordingOverlayWindow.close();
      recordingOverlayWindow = null;
    }

    const primaryDisplay = electronScreen.getPrimaryDisplay();
    
    // 边框实际宽度：2px border + 1px box-shadow = 3px
    // 为了让边框完全在录制区域外部，不被录制到，我们需要：
    // 1. Overlay窗口比录制区域大（左右各+6px，上下各+6px，给边框留出空间）
    // 2. 边框使用 inset: 3px，让边框在窗口内部，距离窗口边缘3px
    // 3. 这样边框完全在录制区域外部（边框中心线距离录制区域边界3px），不会被录制到
    const borderWidth = 3; // 边框宽度（2px border + 1px box-shadow）
    const borderInset = 3; // 边框距离窗口边缘的距离（等于边框宽度，让边框紧贴窗口边缘）
    const windowPadding = borderWidth + borderInset; // 窗口需要比录制区域大的距离（6px）
    
    const recordingX = Math.round(bounds.x);
    const recordingY = Math.round(bounds.y);
    const recordingW = Math.round(bounds.width);
    const recordingH = Math.round(bounds.height);
    
    const windowWidth = Math.max(1, recordingW + windowPadding * 2);
    const windowHeight = Math.max(1, recordingH + windowPadding * 2);
    const windowX = primaryDisplay.bounds.x + recordingX - windowPadding;
    const windowY = primaryDisplay.bounds.y + recordingY - windowPadding;

    recordingOverlayWindow = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x: windowX,
      y: windowY,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // 虚线边框 HTML（纯视觉，pointer-events: none）
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            html, body {
              margin: 0;
              padding: 0;
              background: transparent;
              overflow: hidden;
            }
            .border {
              position: absolute;
              /* 边框向内偏移3px，让边框在窗口内部，距离窗口边缘3px */
              /* 这样边框完全在录制区域外部（边框中心线距离录制区域边界3px），不会被录制到 */
              inset: 3px;
              border: 2px dashed rgba(59,130,246,0.95); /* 蓝色虚线 */
              box-shadow: 0 0 0 1px rgba(15,23,42,0.7);
              border-radius: 6px;
              pointer-events: none;
            }
          </style>
        </head>
        <body>
          <div class="border"></div>
        </body>
      </html>
    `;

    // 设置事件监听器（在 loadURL 之前）
    recordingOverlayWindow.webContents.on('did-finish-load', () => {
      // 确保窗口显示
      if (recordingOverlayWindow && !recordingOverlayWindow.isVisible()) {
        recordingOverlayWindow.show();
      }
    });
    
    recordingOverlayWindow.on('closed', () => {
      recordingOverlayWindow = null;
    });
    
    recordingOverlayWindow.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(html));
    
    // 不拦截鼠标事件，让用户可以正常操作屏幕内容
    recordingOverlayWindow.setIgnoreMouseEvents(true, { forward: true });
    
    // 确保窗口显示（立即显示，不等待加载完成）
    recordingOverlayWindow.show();
  } catch (e) {
    console.error('[MAIN] Failed to show recording overlay:', e);
    console.error('[MAIN] Error details:', e);
  }
});

ipcMain.handle('hide-recording-overlay', () => {
  if (recordingOverlayWindow) {
    recordingOverlayWindow.close();
    recordingOverlayWindow = null;
  }
});

async function captureFullScreen(): Promise<string> {
  const primaryDisplay = electronScreen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  return await captureSelection({
    x: 0,
    y: 0,
    width,
    height,
  });
}

async function captureWindow(): Promise<string> {
  // For window capture, we'll use area selection
  // In a full implementation, you'd enumerate windows
  return await captureArea();
}

async function captureArea(): Promise<string> {
  return new Promise((resolve) => {
    createSelectorWindow();

    selectorWindow?.webContents.once('ipc-message', (_event: any, channel: string, bounds: any) => {
      if (channel === 'selection-complete') {
        selectorWindow?.close();
        captureSelection(bounds).then(resolve);
      } else if (channel === 'selection-cancelled') {
        selectorWindow?.close();
        resolve('');
      }
    });
  });
}

// Update Check Handlers
ipcMain.handle('check-for-updates', async () => {
  try {
    if (!autoUpdater) {
      return {
        hasUpdate: false,
        currentVersion: appVersion,
        error: 'Auto-updater not available in development mode',
      };
    }

    return new Promise((resolve) => {
      let updateCheckTimeout: NodeJS.Timeout;
      
      const cleanup = () => {
        if (updateCheckTimeout) clearTimeout(updateCheckTimeout);
        autoUpdater.removeAllListeners('update-available');
        autoUpdater.removeAllListeners('update-not-available');
        autoUpdater.removeAllListeners('error');
      };

      // Timeout after 10 seconds
      updateCheckTimeout = setTimeout(() => {
        cleanup();
        resolve({
          hasUpdate: false,
          currentVersion: appVersion,
          error: 'Update check timeout',
        });
      }, 10000);

      autoUpdater.once('update-available', (info) => {
        cleanup();
        resolve({
          hasUpdate: true,
          currentVersion: appVersion,
          latestVersion: info.version,
          updateInfo: {
            version: info.version,
            releaseDate: info.releaseDate || new Date().toISOString(),
            releaseNotes: info.releaseNotes,
          },
        });
      });

      autoUpdater.once('update-not-available', () => {
        cleanup();
        resolve({
          hasUpdate: false,
          currentVersion: appVersion,
        });
      });

      autoUpdater.once('error', (error) => {
        cleanup();
        resolve({
          hasUpdate: false,
          currentVersion: appVersion,
          error: error.message || 'Update check failed',
        });
      });

      // Start checking
      autoUpdater.checkForUpdates().catch((err) => {
        cleanup();
        resolve({
          hasUpdate: false,
          currentVersion: appVersion,
          error: err.message || 'Failed to check for updates',
        });
      });
    });
  } catch (error) {
    return {
      hasUpdate: false,
      currentVersion: appVersion,
      error: error.message || 'Unknown error',
    };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    if (!autoUpdater) {
      return { success: false, error: 'Auto-updater not available' };
    }

    return new Promise((resolve) => {
      autoUpdater.once('update-downloaded', () => {
        resolve({ success: true });
      });

      autoUpdater.once('error', (error) => {
        resolve({
          success: false,
          error: error.message || 'Download failed',
        });
      });

      autoUpdater.downloadUpdate().catch((err) => {
        resolve({
          success: false,
          error: err.message || 'Failed to download update',
        });
      });
    });
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
});

ipcMain.handle('get-app-version', () => {
  return appVersion;
});

// 打开 Windows 设置页面（屏幕录制权限）
ipcMain.handle('open-screen-recording-settings', () => {
  if (process.platform === 'win32') {
    try {
      // Windows 10/11 设置 URI
      shell.openExternal('ms-settings:privacy-screenrecording');
      return { success: true };
    } catch (error) {
      console.error('[MAIN] Failed to open settings:', error);
      return { success: false, error: String(error) };
    }
  } else {
    return { success: false, error: 'Not supported on this platform' };
  }
});

// 重新检查权限
ipcMain.handle('recheck-screen-recording-permission', async () => {
  return await checkScreenRecordingPermission();
});

async function captureSelection(bounds: { x: number; y: number; width: number; height: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      // Use desktopCapturer API for screen capture
      const { desktopCapturer } = electron;

      desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 }
      }).then(async (sources: any[]) => {
        if (sources.length === 0) {
          reject(new Error('No screen sources available'));
          return;
        }

        // Find the primary display source
        const primarySource = sources.find((s: any) => s.id.startsWith('screen:0')) || sources[0];

        // Get the thumbnail (full screen)
        const thumbnail = primarySource.thumbnail;

        // Create native image from thumbnail
        const fullImage = nativeImage.createFromDataURL(thumbnail.toDataURL());

        // Get primary display bounds
        const primaryDisplay = electronScreen.getPrimaryDisplay();
        const primaryBounds = primaryDisplay.bounds;

        // Calculate crop area relative to primary display
        const cropX = Math.max(0, bounds.x - primaryBounds.x);
        const cropY = Math.max(0, bounds.y - primaryBounds.y);
        const cropWidth = Math.min(bounds.width, primaryBounds.width - cropX);
        const cropHeight = Math.min(bounds.height, primaryBounds.height - cropY);

        // Crop the image
        const croppedImage = fullImage.crop({
          x: cropX,
          y: cropY,
          width: cropWidth,
          height: cropHeight,
        });

        const dataUrl = `data:image/png;base64,${croppedImage.toPNG().toString('base64')}`;
        resolve(dataUrl);
      }).catch((error: any) => {
        console.error('Desktop capturer error:', error);
        reject(error);
      });
    } catch (error) {
      console.error('Capture selection error:', error);
      reject(error);
    }
  });
}

