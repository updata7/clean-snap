import React, { useState, useEffect } from 'react';
import { useLanguage } from './components/i18n/LanguageContext';
import Editor from './components/Editor';
import VideoRecorder from './components/VideoRecorder';
import PreviewWindow from './components/PreviewWindow';
import HistoryPanel from './components/HistoryPanel';
import LicenseModal from './components/LicenseModal';
import { IconCamera, IconVideo, IconHistory, IconSettings, IconSparkles } from './components/Icons';
import { AppMode, CaptureHistory } from './types';
import { CaptureService } from './services/captureService';
import { getLicenseStatus } from './services/licenseService';

function App() {
  const { t, language, setLanguage } = useLanguage();
  const [mode, setMode] = useState<AppMode>(AppMode.HOME);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [history, setHistory] = useState<CaptureHistory[]>([]);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState(() => getLicenseStatus());
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionType, setPermissionType] = useState<'missing' | 'partial'>('missing');

  // Handle click outside settings menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showSettingsMenu && !target.closest('.app-settings-menu')) {
        setShowSettingsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettingsMenu]);

  // Load history from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('cleansnap-history');
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        setHistory(parsed.slice(0, 50)); // Keep last 50 items
      } catch (e) {
        console.error('Failed to load history', e);
      }
    }
  }, []);

  // Listen for preview images from Electron
  useEffect(() => {
    if (typeof window !== 'undefined' && 'electronAPI' in window) {
      window.electronAPI.onPreviewImage((imageData: string) => {
        setPreviewImage(imageData);
      });
    }
  }, []);

  // Listen for screen recording permission issues (Windows only)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'electronAPI' in window && window.electronAPI.platform === 'win32') {
      let cleanupMissing: (() => void) | undefined;
      let cleanupPartial: (() => void) | undefined;
      
      if (window.electronAPI.onScreenRecordingPermissionMissing) {
        cleanupMissing = window.electronAPI.onScreenRecordingPermissionMissing(() => {
          console.log('[App] Screen recording permission missing');
          setPermissionType('missing');
          setShowPermissionModal(true);
        });
      }
      
      if (window.electronAPI.onScreenRecordingPermissionPartial) {
        cleanupPartial = window.electronAPI.onScreenRecordingPermissionPartial(() => {
          console.log('[App] Screen recording permission partial');
          setPermissionType('partial');
          setShowPermissionModal(true);
        });
      }
      
      return () => {
        cleanupMissing?.();
        cleanupPartial?.();
      };
    }
  }, []);

  const addToHistory = (imageData: string) => {
    const newItem: CaptureHistory = {
      id: Date.now().toString(),
      imageData,
      timestamp: Date.now(),
    };
    const updatedHistory = [newItem, ...history].slice(0, 50);
    setHistory(updatedHistory);
    localStorage.setItem('cleansnap-history', JSON.stringify(updatedHistory));
  };

  const handleCapture = async (type: 'fullscreen' | 'area' | 'window' = 'area') => {
    try {
      let imageData = '';

      switch (type) {
        case 'fullscreen':
          imageData = await CaptureService.captureFullscreen({ autoCopy: false });
          break;
        case 'area':
          imageData = await CaptureService.captureArea({ autoCopy: false });
          break;
        case 'window':
          imageData = await CaptureService.captureWindow({ autoCopy: false });
          break;
      }

      if (imageData) {
        setCapturedImage(imageData);
        addToHistory(imageData);
        setMode(AppMode.EDITOR);
      }
    } catch (err) {
      console.error("Capture failed", err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4 relative">
      <div className="app-drag-region" />

      {/* Top Menu Bar / Settings & Pro */}
      {mode === AppMode.HOME && (
        <div className="absolute top-3 right-3 z-50 flex items-center gap-2 text-xs">
          {/* Pro Button */}
          <button
            onClick={() => {
              setLicenseStatus(getLicenseStatus());
              setShowLicenseModal(true);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
              licenseStatus.isAuthorized
                ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 text-green-400 hover:from-green-500/30 hover:to-emerald-500/30'
                : 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 text-blue-400 hover:from-blue-500/30 hover:to-purple-500/30'
            }`}
            title={licenseStatus.isAuthorized ? t('license.pro_active') : t('license.upgrade_to_pro')}
          >
            <IconSparkles className="w-3.5 h-3.5" />
            <span>{t('license.pro')}</span>
          </button>

          {/* Settings Button */}
          <div className="relative app-settings-menu">
            <button
              onClick={() => setShowSettingsMenu(!showSettingsMenu)}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-full transition-all"
              title={t('recorder.settings_menu')}
            >
              <IconSettings className="w-5 h-5" />
            </button>

            {showSettingsMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-xl py-2 backdrop-blur-xl">
                <div className="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {t('recorder.language')}
                </div>
                <button
                  onClick={() => { setLanguage('en'); setShowSettingsMenu(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-700/50 transition-colors flex items-center justify-between ${language === 'en' ? 'text-blue-400 font-medium' : 'text-slate-300'}`}
                >
                  English
                  {language === 'en' && <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                </button>
                <button
                  onClick={() => { setLanguage('zh'); setShowSettingsMenu(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-700/50 transition-colors flex items-center justify-between ${language === 'zh' ? 'text-blue-400 font-medium' : 'text-slate-300'}`}
                >
                  中文 (Chinese)
                  {language === 'zh' && <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* License Modal */}
      <LicenseModal
        isOpen={showLicenseModal}
        onClose={() => {
          setShowLicenseModal(false);
          setLicenseStatus(getLicenseStatus());
        }}
      />

      {/* Permission Modal (Windows only) */}
      {showPermissionModal && typeof window !== 'undefined' && 'electronAPI' in window && window.electronAPI.platform === 'win32' && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-[500px] max-w-[90vw] p-6 shadow-2xl">
            <div className="flex items-start gap-4 mb-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <IconSettings className="w-6 h-6 text-yellow-400" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-white mb-2">
                  {permissionType === 'missing' ? t('permission.title') : t('permission.partial_title')}
                </h2>
                <p className="text-slate-300 text-sm leading-relaxed">
                  {permissionType === 'missing' ? t('permission.message') : t('permission.partial_message')}
                </p>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-xl p-4 mb-6 border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wider">设置步骤：</div>
              <ol className="text-sm text-slate-300 space-y-2 list-decimal list-inside">
                <li>点击下方"打开设置"按钮</li>
                <li>在设置页面找到 <strong className="text-white">Electron</strong> 应用</li>
                <li>打开 Electron 的屏幕录制权限开关</li>
                <li>返回应用，点击"重新检查"</li>
              </ol>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  if (window.electronAPI.openScreenRecordingSettings) {
                    const result = await window.electronAPI.openScreenRecordingSettings();
                    if (!result.success) {
                      console.error('[App] Failed to open settings:', result.error);
                      alert('无法打开设置页面，请手动打开：设置 > 隐私和安全性 > 屏幕录制');
                    }
                  }
                }}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl"
              >
                {t('permission.open_settings')}
              </button>
              <button
                onClick={async () => {
                  if (window.electronAPI.recheckScreenRecordingPermission) {
                    const hasPermission = await window.electronAPI.recheckScreenRecordingPermission();
                    if (hasPermission) {
                      setShowPermissionModal(false);
                    }
                  }
                }}
                className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl transition-all"
              >
                {t('permission.check_again')}
              </button>
              <button
                onClick={() => setShowPermissionModal(false)}
                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl transition-all"
              >
                {t('permission.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === AppMode.HOME && (
        <div className="max-w-sm w-full bg-slate-900/70 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-2xl">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-500 to-purple-500 mb-3 shadow-lg shadow-blue-500/30">
              <IconCamera className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">
              CleanSnap
            </h1>
            <p className="text-slate-400 mt-1 text-sm">{t('app.subtitle')}</p>
          </div>

          <div className="space-y-2.5">
            <button
              onClick={() => handleCapture('area')}
              className="group w-full bg-white text-slate-900 hover:bg-blue-50 font-semibold py-3 px-4 rounded-xl flex items-center justify-between transition-all shadow-lg hover:shadow-xl"
            >
              <div className="flex items-center">
                <span className="bg-slate-200 p-2 rounded-lg mr-3 group-hover:bg-blue-200 transition-colors">
                  <IconCamera className="w-5 h-5" />
                </span>
                <div className="text-left">
                  <div className="text-sm">{t('home.capture_area')}</div>
                  <div className="text-[11px] text-slate-500 font-normal">{t('home.capture_area_desc')}</div>
                </div>
              </div>
            </button>

            <button
              onClick={() => handleCapture('fullscreen')}
              className="group w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-white font-medium py-2.5 px-4 rounded-xl flex items-center justify-between transition-all"
            >
              <div className="text-left">
                <div className="text-xs">{t('home.capture_fullscreen')}</div>
              </div>
            </button>



            <button
              onClick={() => setMode(AppMode.VIDEO_PREVIEW)}
              className="group w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-between transition-all"
            >
              <div className="flex items-center">
                <span className="bg-slate-700 p-2 rounded-lg mr-3 group-hover:bg-purple-900/50 transition-colors">
                  <IconVideo className="w-5 h-5" />
                </span>
                <div className="text-left">
                  <div className="text-sm">{t('home.record_screen')}</div>
                  <div className="text-[11px] text-slate-400 font-normal">{t('home.record_screen_desc')}</div>
                </div>
              </div>
            </button>

            {history.length > 0 && (
              <button
                onClick={() => setMode(AppMode.HISTORY)}
                className="group w-full bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 text-white font-medium py-2.5 px-4 rounded-xl flex items-center justify-between transition-all"
              >
                <div className="flex items-center">
                  <IconHistory className="w-5 h-5 mr-3" />
                  <div className="text-left">
                    <div className="text-sm">{t('home.history')} ({history.length})</div>
                  </div>
                </div>
              </button>
            )}
          </div>

          <div className="mt-6 text-center text-[11px] text-slate-500">
            {t('app.footer_powered').replace('%s', typeof window !== 'undefined' && 'electronAPI' in window ? t('app.desktop_app') : t('app.web_app'))}
          </div>

          <div className="mt-2 text-center text-[11px] text-slate-600">
            <div>
              {typeof window !== 'undefined' && 'electronAPI' in window && window.electronAPI.platform === 'darwin'
                ? t('app.shortcuts_mac')
                : typeof window !== 'undefined' && 'electronAPI' in window
                  ? t('app.shortcuts_win')
                  : t('app.footer_hint')}
            </div>
          </div>
        </div>
      )}

      {mode === AppMode.EDITOR && capturedImage && (
        <div className="fixed inset-0 z-50">
          <Editor
            imageSrc={capturedImage}
            onClose={() => { setCapturedImage(null); setMode(AppMode.HOME); }}
            onSave={async (imageData) => {
              try {
                const result = await CaptureService.saveImage(imageData);
                if (result.success) {
                  addToHistory(imageData);
                  console.log('Image saved successfully', result.path);
                } else {
                  console.error('Save failed:', result);
                }
              } catch (error) {
                console.error('Save error:', error);
                throw error;
              }
            }}
            onCopy={(imageData) => {
              CaptureService.copyToClipboard(imageData);
            }}
          />
        </div>
      )}

      {mode === AppMode.VIDEO_PREVIEW && (
        <VideoRecorder onClose={() => setMode(AppMode.HOME)} />
      )}

      {mode === AppMode.HISTORY && (
        <HistoryPanel
          history={history}
          onClose={() => setMode(AppMode.HOME)}
          onSelect={(item) => {
            setCapturedImage(item.imageData);
            setMode(AppMode.EDITOR);
          }}
          onDelete={(id) => {
            const updated = history.filter(h => h.id !== id);
            setHistory(updated);
            localStorage.setItem('cleansnap-history', JSON.stringify(updated));
          }}
        />
      )}

      {previewImage && (
        <PreviewWindow
          imageSrc={previewImage}
          onClose={() => setPreviewImage(null)}
          onEdit={() => {
            setCapturedImage(previewImage);
            setPreviewImage(null);
            setMode(AppMode.EDITOR);
          }}
        />
      )}
    </div>
  );
}

export default App;