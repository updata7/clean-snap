"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// 拦截渲染进程的 console 并发送到主进程
// 必须在页面加载之前拦截，确保所有代码的 console 调用都被捕获
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;
// 辅助函数：安全地发送日志到主进程
const sendLog = (level, ...args) => {
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
            }
            catch {
                return String(a);
            }
        });
        electron_1.ipcRenderer.send('renderer-log', level, ...serializedArgs);
    }
    catch (e) {
        // 如果 IPC 失败，至少输出到控制台
        originalError('[PRELOAD] Failed to send log to main process:', e);
    }
};
console.log = (...args) => {
    sendLog('log', ...args);
    originalLog.apply(console, args);
};
console.warn = (...args) => {
    sendLog('warn', ...args);
    originalWarn.apply(console, args);
};
console.error = (...args) => {
    sendLog('error', ...args);
    originalError.apply(console, args);
};
// 确保在页面加载时也拦截（防止某些代码重新定义 console）
window.addEventListener('DOMContentLoaded', () => {
    // 再次确保 console 被拦截（防止页面代码重新定义）
    if (console.log !== originalLog) {
        const pageLog = console.log;
        console.log = (...args) => {
            sendLog('log', ...args);
            pageLog.apply(console, args);
        };
    }
    if (console.warn !== originalWarn) {
        const pageWarn = console.warn;
        console.warn = (...args) => {
            sendLog('warn', ...args);
            pageWarn.apply(console, args);
        };
    }
    if (console.error !== originalError) {
        const pageError = console.error;
        console.error = (...args) => {
            sendLog('error', ...args);
            pageError.apply(console, args);
        };
    }
});
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    captureFullscreen: () => electron_1.ipcRenderer.invoke('capture-fullscreen'),
    captureArea: () => electron_1.ipcRenderer.invoke('capture-area'),
    captureWindow: () => electron_1.ipcRenderer.invoke('capture-window'),
    captureSelection: (bounds) => electron_1.ipcRenderer.invoke('capture-selection', bounds),
    getScreens: () => electron_1.ipcRenderer.invoke('get-screens'),
    getDesktopSources: () => electron_1.ipcRenderer.invoke('get-desktop-sources'),
    // 录制区域虚线框 Overlay
    showRecordingOverlay: (bounds) => electron_1.ipcRenderer.invoke('show-recording-overlay', bounds),
    hideRecordingOverlay: () => {
        console.log('[PRELOAD] hideRecordingOverlay called from renderer');
        console.log('[PRELOAD] Call stack:', new Error().stack);
        return electron_1.ipcRenderer.invoke('hide-recording-overlay');
    },
    saveImage: (imageData, filename) => electron_1.ipcRenderer.invoke('save-image', imageData, filename),
    copyToClipboard: (imageData) => electron_1.ipcRenderer.invoke('copy-to-clipboard', imageData),
    closeSelector: () => electron_1.ipcRenderer.invoke('close-selector'),
    showPreview: (imageData) => electron_1.ipcRenderer.invoke('show-preview', imageData),
    showMainWindow: () => electron_1.ipcRenderer.invoke('show-main-window'),
    onPreviewImage: (callback) => {
        const handler = (_event, imageData) => callback(imageData);
        electron_1.ipcRenderer.on('preview-image', handler);
        // Return cleanup function if we want to be consistent, though App.tsx doesn't use it yet.
        // Ideally we should return cleanup everywhere.
        return () => electron_1.ipcRenderer.removeListener('preview-image', handler);
    },
    onScreenshotCaptured: (callback) => {
        const handler = (_event, imageData) => callback(imageData);
        electron_1.ipcRenderer.on('screenshot-captured', handler);
        return () => electron_1.ipcRenderer.removeListener('screenshot-captured', handler);
    },
    onGlobalShortcut: (callback) => {
        const handler = (_event, command) => callback(command);
        electron_1.ipcRenderer.on('global-shortcut', handler);
        return () => electron_1.ipcRenderer.removeListener('global-shortcut', handler);
    },
    saveRecording: (buffer, format) => electron_1.ipcRenderer.invoke('save-recording', buffer, format),
    // Streaming APIs
    startRecordingStream: () => electron_1.ipcRenderer.invoke('start-recording-stream'),
    writeRecordingChunk: (buffer) => electron_1.ipcRenderer.invoke('write-recording-chunk', buffer),
    stopRecordingStream: (format) => electron_1.ipcRenderer.invoke('stop-recording-stream', format),
    setIgnoreMouseEvents: (ignore, options) => electron_1.ipcRenderer.send('set-ignore-mouse-events', ignore, options),
    minimizeWindow: () => electron_1.ipcRenderer.send('minimize-window'),
    showWindow: () => electron_1.ipcRenderer.send('show-window'),
    createAreaSelector: () => electron_1.ipcRenderer.send('create-area-selector'),
    areaSelected: (bounds) => electron_1.ipcRenderer.send('area-selected', bounds),
    cancelAreaSelection: () => electron_1.ipcRenderer.send('cancel-area-selection'),
    onAreaSelectionResult: (callback) => {
        const handler = (_event, bounds) => callback(bounds);
        electron_1.ipcRenderer.on('area-selection-result', handler);
        return () => electron_1.ipcRenderer.removeListener('area-selection-result', handler);
    },
    platform: process.platform,
    versions: {
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
    },
    // Update APIs
    getAppVersion: () => electron_1.ipcRenderer.invoke('get-app-version'),
    checkForUpdates: () => electron_1.ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => electron_1.ipcRenderer.invoke('download-update'),
    // Export progress listener
    onExportProgress: (callback) => {
        const handler = (_event, progress) => callback(progress);
        electron_1.ipcRenderer.on('export-progress', handler);
        return () => electron_1.ipcRenderer.removeListener('export-progress', handler);
    },
    // Permission check
    onScreenRecordingPermissionMissing: (callback) => {
        const handler = () => callback();
        electron_1.ipcRenderer.on('screen-recording-permission-missing', handler);
        return () => electron_1.ipcRenderer.removeListener('screen-recording-permission-missing', handler);
    },
    onScreenRecordingPermissionPartial: (callback) => {
        const handler = () => callback();
        electron_1.ipcRenderer.on('screen-recording-permission-partial', handler);
        return () => electron_1.ipcRenderer.removeListener('screen-recording-permission-partial', handler);
    },
    openScreenRecordingSettings: () => electron_1.ipcRenderer.invoke('open-screen-recording-settings'),
    recheckScreenRecordingPermission: () => electron_1.ipcRenderer.invoke('recheck-screen-recording-permission'),
});
