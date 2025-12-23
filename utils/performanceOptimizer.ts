/**
 * Performance Optimizer
 * 借鉴 Cap 的性能优化技术
 * 包括：自适应分辨率、内存管理、CPU 检测
 */

export interface PerformanceConfig {
  targetFps: number;
  maxResolution: { width: number; height: number };
  enableAdaptiveResolution: boolean;
}

export class PerformanceOptimizer {
  private static cpuCores: number | null = null;
  private static gpuInfo: any = null;

  /**
   * 获取 CPU 核心数（缓存结果）
   */
  static getCPUCores(): number {
    if (this.cpuCores === null) {
      this.cpuCores = navigator.hardwareConcurrency || 4;
    }
    return this.cpuCores;
  }

  /**
   * 自适应分辨率缩放（借鉴 Cap 的实现思路）
   * 根据 CPU 核心数和像素数自动调整
   */
  static calculateOptimalScale(
    width: number,
    height: number,
    targetFps: number = 30
  ): number {
    // 最优质量：完全禁用自动分辨率缩放，始终保持原始分辨率
    // 为了获得最高清晰度，不进行任何分辨率降低
    return 1.0; // 始终使用原始分辨率，不缩放
  }

  /**
   * 计算最佳帧率（根据硬件能力）
   */
  static calculateOptimalFps(
    width: number,
    height: number
  ): number {
    const cores = this.getCPUCores();
    const pixels = width * height;

    // 低端设备：30fps
    if (cores < 4 || pixels > 2560 * 1440) {
      return 30;
    }

    // 中端设备：60fps
    if (cores >= 4 && cores < 8 && pixels <= 1920 * 1080) {
      return 60;
    }

    // 高端设备：60fps（可以扩展到更高）
    return 60;
  }

  /**
   * 计算最佳编码比特率（根据分辨率和帧率）
   */
  static calculateOptimalBitrate(
    width: number,
    height: number,
    fps: number
  ): number {
    const pixels = width * height;
    // 最优质量：使用更高的比特率以确保最高清晰度
    // 重要：OpenH264 编码器有最大比特率限制（12 Mbps）
    // 必须确保比特率不超过 12 Mbps，否则编码器会初始化失败
    // 注意：即使限制在 12 Mbps，质量仍然很高，因为 CRF 值已经设置得很低（16-20）
    
    // 不根据帧率倍增，直接使用固定值，避免超过限制
    let bitrate: number;
    if (pixels <= 1280 * 720) {
      bitrate = 5_000_000; // 5 Mbps
    } else if (pixels <= 1920 * 1080) {
      bitrate = 10_000_000; // 10 Mbps（高质量，但不超过 12 Mbps 限制）
    } else if (pixels <= 2560 * 1440) {
      bitrate = 12_000_000; // 12 Mbps（编码器最大限制）
    } else {
      bitrate = 12_000_000; // 12 Mbps（编码器最大限制，4K+ 也使用此值）
    }
    
    // 确保不超过 12 Mbps 限制
    const maxBitrate = 12_000_000; // OpenH264 编码器最大限制
    return Math.min(bitrate, maxBitrate);
  }

  /**
   * 检测是否应该启用硬件加速
   */
  static shouldUseHardwareAcceleration(): boolean {
    // 简单检测：检查是否有 GPU 信息
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        // 检测是否是集成显卡（性能较差）
        const isIntegrated = renderer.toLowerCase().includes('intel') && 
                            renderer.toLowerCase().includes('graphics');
        return !isIntegrated;
      }
    }
    
    return true; // 默认启用
  }

  /**
   * 获取性能等级
   */
  static getPerformanceTier(): 'low' | 'medium' | 'high' {
    const cores = this.getCPUCores();
    const hasHardwareAccel = this.shouldUseHardwareAcceleration();

    if (cores < 4 || !hasHardwareAccel) {
      return 'low';
    } else if (cores < 8) {
      return 'medium';
    } else {
      return 'high';
    }
  }

  /**
   * 获取推荐的编码预设（用于 FFmpeg）
   */
  static getRecommendedPreset(): 'ultrafast' | 'fast' | 'medium' {
    const tier = this.getPerformanceTier();
    
    switch (tier) {
      case 'low':
        return 'ultrafast';
      case 'medium':
        return 'fast';
      case 'high':
        return 'medium';
    }
  }

  /**
   * 获取推荐的 CRF 值（质量）
   */
  static getRecommendedCRF(): number {
    const tier = this.getPerformanceTier();
    
    switch (tier) {
      case 'low':
        return 28; // 较低质量，更快编码
      case 'medium':
        return 23; // 平衡
      case 'high':
        return 20; // 更高质量
    }
  }
}
