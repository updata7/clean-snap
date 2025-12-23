import { contextBridge, ipcRenderer } from 'electron';

// 拦截渲染进程的 console 并发送到主进程
// 必须在页面加载之前拦截，确保所有代码的 console 调用都被捕获
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

// 辅助函数：安全地发送日志到主进程
const sendLog = (level: 'log' | 'warn' | 'error', ...args: any[]) => {
  try {
    // 将参数序列化，避免传递不可序列化的对象
    const serializedArgs = args.map((a) => {
      if (a instanceof Error) {
        return a.stack || a.message || String(a);
      }
      if (typeof a === 'string') {
        return a;
      }
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    });
    ipcRenderer.send('renderer-log', level, ...serializedArgs);
  } catch (e) {
    // 如果 IPC 失败，至少输出到控制台
    originalError('[PRELOAD] Failed to send log to main process:', e);
  }
};

console.log = (...args: any[]) => {
  sendLog('log', ...args);
  originalLog.apply(console, args);
};

console.warn = (...args: any[]) => {
  sendLog('warn', ...args);
  originalWarn.apply(console, args);
};

console.error = (...args: any[]) => {
  sendLog('error', ...args);
  originalError.apply(console, args);
};

// 确保在页面加载时也拦截（防止某些代码重新定义 console）
window.addEventListener('DOMContentLoaded', () => {
  // 再次确保 console 被拦截（防止页面代码重新定义）
  if (console.log !== originalLog) {
    const pageLog = console.log;
    console.log = (...args: any[]) => {
      sendLog('log', ...args);
      pageLog.apply(console, args);
    };
  }
  if (console.warn !== originalWarn) {
    const pageWarn = console.warn;
    console.warn = (...args: any[]) => {
      sendLog('warn', ...args);
      pageWarn.apply(console, args);
    };
  }
  if (console.error !== originalError) {
    const pageError = console.error;
    console.error = (...args: any[]) => {
      sendLog('error', ...args);
      pageError.apply(console, args);
    };
  }
});

contextBridge.exposeInMainWorld('electronAPI', {
  captureFullscreen: () => ipcRenderer.invoke('capture-fullscreen'),
  captureArea: () => ipcRenderer.invoke('capture-area'),
  captureWindow: () => ipcRenderer.invoke('capture-window'),
  captureSelection: (bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke('capture-selection', bounds),
  getScreens: () => ipcRenderer.invoke('get-screens'),
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
  // 录制区域虚线框 Overlay
  showRecordingOverlay: (bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke('show-recording-overlay', bounds),
  hideRecordingOverlay: () => {
    console.log('[PRELOAD] hideRecordingOverlay called from renderer');
    console.log('[PRELOAD] Call stack:', new Error().stack);
    return ipcRenderer.invoke('hide-recording-overlay');
  },
  saveImage: (imageData: string, filename?: string) =>
    ipcRenderer.invoke('save-image', imageData, filename),
  copyToClipboard: (imageData: string) => ipcRenderer.invoke('copy-to-clipboard', imageData),
  closeSelector: () => ipcRenderer.invoke('close-selector'),
  showPreview: (imageData: string) => ipcRenderer.invoke('show-preview', imageData),
  showMainWindow: () => ipcRenderer.invoke('show-main-window'),
  onPreviewImage: (callback: (imageData: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, imageData: string) => callback(imageData);
    ipcRenderer.on('preview-image', handler);
    // Return cleanup function if we want to be consistent, though App.tsx doesn't use it yet.
    // Ideally we should return cleanup everywhere.
    return () => ipcRenderer.removeListener('preview-image', handler);
  },
  onScreenshotCaptured: (callback: (imageData: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, imageData: string) => callback(imageData);
    ipcRenderer.on('screenshot-captured', handler);
    return () => ipcRenderer.removeListener('screenshot-captured', handler);
  },
  onGlobalShortcut: (callback: (command: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, command: string) => callback(command);
    ipcRenderer.on('global-shortcut', handler);
    return () => ipcRenderer.removeListener('global-shortcut', handler);
  },
  saveRecording: (buffer: ArrayBuffer, format: 'mp4' | 'gif') =>
    ipcRenderer.invoke('save-recording', buffer, format),
  // Streaming APIs
  startRecordingStream: () => ipcRenderer.invoke('start-recording-stream'),
  writeRecordingChunk: (buffer: ArrayBuffer) => ipcRenderer.invoke('write-recording-chunk', buffer),
  stopRecordingStream: (format: 'mp4' | 'gif') => ipcRenderer.invoke('stop-recording-stream', format),
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) =>
    ipcRenderer.send('set-ignore-mouse-events', ignore, options),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  showWindow: () => ipcRenderer.send('show-window'),
  createAreaSelector: () => ipcRenderer.send('create-area-selector'),
  areaSelected: (bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.send('area-selected', bounds),
  cancelAreaSelection: () => ipcRenderer.send('cancel-area-selection'),
  onAreaSelectionResult: (callback: (bounds: { x: number; y: number; width: number; height: number } | null) => void) => {
    const handler = (_event: any, bounds: any) => callback(bounds);
    ipcRenderer.on('area-selection-result', handler);
    return () => ipcRenderer.removeListener('area-selection-result', handler);
  },
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  // Update APIs
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  // Export progress listener
  onExportProgress: (callback: (progress: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: number) => callback(progress);
    ipcRenderer.on('export-progress', handler);
    return () => ipcRenderer.removeListener('export-progress', handler);
  },
  // Permission check
  onScreenRecordingPermissionMissing: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('screen-recording-permission-missing', handler);
    return () => ipcRenderer.removeListener('screen-recording-permission-missing', handler);
  },
  onScreenRecordingPermissionPartial: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('screen-recording-permission-partial', handler);
    return () => ipcRenderer.removeListener('screen-recording-permission-partial', handler);
  },
  openScreenRecordingSettings: () => ipcRenderer.invoke('open-screen-recording-settings'),
  recheckScreenRecordingPermission: () => ipcRenderer.invoke('recheck-screen-recording-permission'),
});

