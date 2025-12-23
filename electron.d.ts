export interface ElectronAPI {
  captureFullscreen: () => Promise<string>;
  captureArea: () => Promise<string>;
  captureWindow: () => Promise<string>;
  captureSelection: (bounds: { x: number; y: number; width: number; height: number }) => Promise<string>;
  getScreens: () => Promise<any[]>;
  getDesktopSources: () => Promise<Array<{ id: string; name: string; thumbnail: string }>>;
  showRecordingOverlay: (bounds: { x: number; y: number; width: number; height: number }) => Promise<void>;
  hideRecordingOverlay: () => Promise<void>;
  saveImage: (imageData: string, filename?: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  copyToClipboard: (imageData: string) => Promise<{ success: boolean; error?: string }>;
  closeSelector: () => Promise<void>;
  showPreview: (imageData: string) => Promise<void>;
  showMainWindow: () => Promise<void>;
  saveRecording: (buffer: ArrayBuffer, format: 'mp4' | 'gif') => Promise<{ success: boolean; path?: string; error?: string }>;
  startRecordingStream: () => Promise<{ success: boolean; path?: string; error?: string }>;
  writeRecordingChunk: (buffer: ArrayBuffer) => Promise<boolean>;
  stopRecordingStream: (format: 'mp4' | 'gif') => Promise<{ success: boolean; path?: string; error?: string; canceled?: boolean }>;
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => void;
  minimizeWindow: () => void;
  showWindow: () => void;
  createAreaSelector: () => void;
  areaSelected: (bounds: { x: number; y: number; width: number; height: number }) => void;
  cancelAreaSelection: () => void;
  onAreaSelectionResult: (callback: (bounds: { x: number; y: number; width: number; height: number } | null) => void) => () => void;
  onPreviewImage: (callback: (imageData: string) => void) => () => void;
  onScreenshotCaptured: (callback: (imageData: string) => void) => () => void;
  onGlobalShortcut: (callback: (command: string) => void) => () => void;
  platform: string;
  getAppVersion: () => Promise<string>;
  checkForUpdates: () => Promise<{ hasUpdate: boolean; currentVersion: string; latestVersion?: string; updateInfo?: { version: string; releaseDate: string; releaseNotes?: string }; error?: string }>;
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
  onExportProgress: (callback: (progress: number) => void) => () => void;
  // Permission check APIs
  onScreenRecordingPermissionMissing?: (callback: () => void) => () => void;
  onScreenRecordingPermissionPartial?: (callback: () => void) => () => void;
  openScreenRecordingSettings: () => Promise<{ success: boolean; error?: string }>;
  recheckScreenRecordingPermission: () => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

