export interface CaptureOptions {
  autoCopy?: boolean;
  autoSave?: boolean;
  showPreview?: boolean;
}

export class CaptureService {
  private static isElectron(): boolean {
    return typeof window !== 'undefined' && 'electronAPI' in window;
  }

  static async captureFullscreen(options: CaptureOptions = {}): Promise<string> {
    if (this.isElectron()) {
      const imageData = await window.electronAPI.captureFullscreen();
      await this.handleCaptureResult(imageData, options);
      return imageData;
    } else {
      // Fallback to browser API
      return await this.browserCapture();
    }
  }

  static async captureArea(options: CaptureOptions = {}): Promise<string> {
    if (this.isElectron()) {
      const imageData = await window.electronAPI.captureArea();
      await this.handleCaptureResult(imageData, options);
      return imageData;
    } else {
      return await this.browserCapture();
    }
  }

  static async captureWindow(options: CaptureOptions = {}): Promise<string> {
    if (this.isElectron()) {
      const imageData = await window.electronAPI.captureWindow();
      await this.handleCaptureResult(imageData, options);
      return imageData;
    } else {
      return await this.browserCapture();
    }
  }

  static async captureSelection(
    bounds: { x: number; y: number; width: number; height: number },
    options: CaptureOptions = {}
  ): Promise<string> {
    if (this.isElectron()) {
      const imageData = await window.electronAPI.captureSelection(bounds);
      await this.handleCaptureResult(imageData, options);
      return imageData;
    } else {
      return await this.browserCapture();
    }
  }

  private static async handleCaptureResult(imageData: string, options: CaptureOptions): Promise<void> {
    if (!imageData) return;

    if (options.autoCopy && this.isElectron()) {
      await window.electronAPI.copyToClipboard(imageData);
    }

    if (options.autoSave && this.isElectron()) {
      await window.electronAPI.saveImage(imageData);
    }

    if (options.showPreview && this.isElectron()) {
      await window.electronAPI.showPreview(imageData);
    }
  }

  private static async browserCapture(): Promise<string> {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'window' },
        audio: false,
      });

      const track = stream.getVideoTracks()[0];
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();

      await new Promise((resolve) => {
        video.onloadedmetadata = () => resolve(true);
      });

      await new Promise((r) => setTimeout(r, 500));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        track.stop();
        video.remove();
        canvas.remove();
        return dataUrl;
      }

      track.stop();
      video.remove();
      canvas.remove();
      return '';
    } catch (err) {
      console.error('Capture failed', err);
      return '';
    }
  }

  static async saveImage(imageData: string, filename?: string): Promise<{ success: boolean; path?: string }> {
    if (this.isElectron()) {
      return await window.electronAPI.saveImage(imageData, filename);
    } else {
      // Browser fallback
      const link = document.createElement('a');
      link.download = filename || `cleansnap-${Date.now()}.png`;
      link.href = imageData;
      link.click();
      return { success: true };
    }
  }

  static async copyToClipboard(imageData: string): Promise<boolean> {
    if (this.isElectron()) {
      const result = await window.electronAPI.copyToClipboard(imageData);
      return result.success;
    } else {
      try {
        const response = await fetch(imageData);
        const blob = await response.blob();
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        return true;
      } catch (err) {
        console.error('Copy failed', err);
        return false;
      }
    }
  }
}

