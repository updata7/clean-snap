/**
 * Frame Buffer Manager
 * 借鉴 Cap 的帧缓冲队列管理技术
 * 动态调整队列深度，处理过载情况
 */

export enum DropStrategy {
  DropOldest = 'drop-oldest',  // 丢弃最旧的帧（推荐）
  DropNewest = 'drop-newest',  // 丢弃最新的帧
}

export interface FrameBufferConfig {
  maxSize: number;           // 最大队列深度
  dropStrategy: DropStrategy; // 丢帧策略
  targetFps: number;         // 目标帧率
}

export class FrameBuffer {
  private queue: ArrayBuffer[] = [];
  private config: FrameBufferConfig;
  private stats = {
    framesReceived: 0,
    framesDropped: 0,
    framesProcessed: 0,
  };

  constructor(config: Partial<FrameBufferConfig> = {}) {
    this.config = {
      maxSize: config.maxSize || 8,
      dropStrategy: config.dropStrategy || DropStrategy.DropOldest,
      targetFps: config.targetFps || 30,
    };
  }

  /**
   * 动态调整队列深度（借鉴 Cap 的实现）
   * 根据帧率自动调整：queue_depth = (fps / 30) * 5，限制在 3-8 之间
   */
  adjustQueueDepth(fps: number): void {
    const calculated = Math.ceil((fps / 30) * 5);
    this.config.maxSize = Math.max(3, Math.min(8, calculated));
  }

  /**
   * 添加帧到缓冲区
   */
  add(frame: ArrayBuffer): boolean {
    this.stats.framesReceived++;

    // 如果队列已满，根据策略丢弃帧
    if (this.queue.length >= this.config.maxSize) {
      this.stats.framesDropped++;
      
      if (this.config.dropStrategy === DropStrategy.DropOldest) {
        this.queue.shift(); // 丢弃最旧的
      } else {
        this.queue.pop(); // 丢弃最新的
      }
    }

    this.queue.push(frame);
    return true;
  }

  /**
   * 获取下一帧
   */
  get(): ArrayBuffer | null {
    const frame = this.queue.shift();
    if (frame) {
      this.stats.framesProcessed++;
    }
    return frame || null;
  }

  /**
   * 获取所有待处理的帧（批量处理）
   */
  getAll(): ArrayBuffer[] {
    const frames = [...this.queue];
    this.queue = [];
    this.stats.framesProcessed += frames.length;
    return frames;
  }

  /**
   * 清空缓冲区
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * 获取当前队列深度
   */
  getQueueDepth(): number {
    return this.queue.length;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      currentQueueDepth: this.queue.length,
      dropRate: this.stats.framesReceived > 0 
        ? (this.stats.framesDropped / this.stats.framesReceived) * 100 
        : 0,
    };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      framesReceived: 0,
      framesDropped: 0,
      framesProcessed: 0,
    };
  }
}
