/**
 * Update Service
 * Handles app version checking and updates using electron-updater
 */

export interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes?: string;
  downloadUrl?: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  updateInfo?: UpdateInfo;
  error?: string;
}

// Get version from package.json (will be injected at build time)
// Fallback: try to get from electronAPI or use default
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0';

/**
 * Get current app version
 */
export async function getCurrentVersion(): Promise<string> {
  // Try to get from Electron first (more accurate)
  if (typeof window !== 'undefined' && 'electronAPI' in window && window.electronAPI.getAppVersion) {
    try {
      const version = await window.electronAPI.getAppVersion();
      return version;
    } catch (e) {
      // Fallback to env version
    }
  }
  return APP_VERSION;
}

/**
 * Check for updates
 * In Electron, this uses electron-updater
 * In web, this checks a remote API
 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = getCurrentVersion();
  
  try {
    // Check if running in Electron
    if (typeof window !== 'undefined' && 'electronAPI' in window && window.electronAPI.checkForUpdates) {
      const result = await window.electronAPI.checkForUpdates();
      return {
        hasUpdate: result.hasUpdate || false,
        currentVersion,
        latestVersion: result.latestVersion,
        updateInfo: result.updateInfo,
        error: result.error,
      };
    }
    
    // Web fallback: check remote API
    // Replace with your actual update server URL
    const updateServerUrl = 'https://api.cleansnap.app/updates/check';
    
    try {
      const response = await fetch(`${updateServerUrl}?version=${currentVersion}&platform=${navigator.platform}`);
      if (response.ok) {
        const data = await response.json();
        return {
          hasUpdate: data.hasUpdate || false,
          currentVersion,
          latestVersion: data.latestVersion,
          updateInfo: data.updateInfo,
        };
      }
    } catch (fetchError) {
      // Silently fail in web mode - updates not critical
      console.warn('Update check failed (web mode):', fetchError);
    }
    
    return {
      hasUpdate: false,
      currentVersion,
    };
  } catch (error) {
    console.error('Error checking for updates:', error);
    return {
      hasUpdate: false,
      currentVersion,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Download and install update (Electron only)
 */
export async function downloadUpdate(): Promise<{ success: boolean; error?: string }> {
  try {
    if (typeof window !== 'undefined' && 'electronAPI' in window && window.electronAPI.downloadUpdate) {
      const result = await window.electronAPI.downloadUpdate();
      return result;
    }
    
    return { success: false, error: 'Update download not available in web mode' };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
