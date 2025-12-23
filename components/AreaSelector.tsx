import React, { useState, useRef, useEffect } from 'react';

type AspectRatio = '16:9' | '9:16' | '4:3' | '1:1' | '6:7' | 'free';

const AreaSelector: React.FC = () => {
  // 是否正在绘制新区域（单纯拖拽，不再支持复杂拖动/缩放）
  const [isSelecting, setIsSelecting] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('free');
  const [selection, setSelection] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const startPosRef = useRef({ x: 0, y: 0 });

  const getAspectRatioValue = (ratio: AspectRatio): number | null => {
    switch (ratio) {
      case '16:9': return 16 / 9;
      case '9:16': return 9 / 16;
      case '4:3': return 4 / 3;
      case '1:1': return 1;
      case '6:7': return 6 / 7;
      case 'free': return null;
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    console.log('[AreaSelector] Mouse down at:', e.clientX, e.clientY);

    // 无论点击哪里，统一开始一轮新的选择（简化交互，类似 macOS 截图）
    const x = e.clientX;
    const y = e.clientY;
    startPosRef.current = { x, y };
    setSelection({ x, y, width: 0, height: 0 });
    setIsSelecting(true);
    e.preventDefault();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isSelecting) return;

    const width = e.clientX - startPosRef.current.x;
    const height = e.clientY - startPosRef.current.y;
    const ratio = getAspectRatioValue(aspectRatio);

    let finalWidth = Math.abs(width);
    let finalHeight = Math.abs(height);

    if (ratio) {
      if (Math.abs(width) > Math.abs(height)) {
        finalHeight = finalWidth / ratio;
      } else {
        finalWidth = finalHeight * ratio;
      }
    }

    const newSelection = {
      x: width < 0 ? startPosRef.current.x - finalWidth : startPosRef.current.x,
      y: height < 0 ? startPosRef.current.y - finalHeight : startPosRef.current.y,
      width: finalWidth,
      height: finalHeight
    };

    setSelection(newSelection);
  };

  const handleMouseUp = (e?: React.MouseEvent) => {
    if (e) {
      console.log('[AreaSelector] Mouse up at:', e.clientX, e.clientY);
    }
    console.log('[AreaSelector] Final selection:', selection);
    setIsSelecting(false);

    // 如果拖动距离太小，则认为是误操作，清空选择
    if (selection.width < 5 || selection.height < 5) {
      setSelection({ x: 0, y: 0, width: 0, height: 0 });
    }
  };

  const handleConfirm = () => {
    console.log('[AreaSelector] Confirm clicked, selection:', selection);
    if (selection.width > 0 && selection.height > 0) {
      // ========== 坐标系统分析 ==========
      // selection.x, selection.y 是选择框 div 的左上角坐标（起点）
      // selection.width, selection.height 是选择框 div 的总宽度和高度
      // 
      // 选择框的视觉结构（从外到内）：
      // 1. Resize handles: 蓝色小方块，位置在边框外
      //    - 左边: -left-1.5 (超出左边框 1.5px，即从 selection.x - 1.5 开始)
      //    - 右边: -right-1.5 (超出右边框 1.5px，即到 selection.x + width + 1.5 结束)
      //    - 上边: -top-1.5 (超出上边框 1.5px，即从 selection.y - 1.5 开始)
      //    - 下边: -bottom-1.5 (超出下边框 1.5px，即到 selection.y + height + 1.5 结束)
      // 2. border-4: 4px 白色边框（在元素内部，从 selection.x 到 selection.x + width）
      // 3. 内容区域: 边框内的区域（需要录制的区域）
      //
      // 实际内容区域（需要录制的区域）计算：
      // - 起点（左上角）: 
      //   - X: selection.x + borderWidth (排除左边框) + resizeHandleOffset (排除左侧 resize handle)
      //   - Y: selection.y + borderWidth (排除上边框) + resizeHandleOffset (排除上方 resize handle)
      // - 终点（右下角）:
      //   - X: (selection.x + selection.width) - borderWidth (排除右边框) - resizeHandleOffset (排除右侧 resize handle)
      //   - Y: (selection.y + selection.height) - borderWidth (排除下边框) - resizeHandleOffset (排除下方 resize handle)
      // - 调整后的宽度: selection.width - 2 * (borderWidth + resizeHandleOffset)
      // - 调整后的高度: selection.height - 2 * (borderWidth + resizeHandleOffset)
      //
      // 注意：左右和上下都是完全对称的，使用相同的偏移量
      
      const borderWidth = 4; // border-4 = 4px 边框
      const resizeHandleOffset = 1.5; // resize handles 超出边框的距离（-left-1.5, -right-1.5 等）
      const totalOffset = borderWidth + resizeHandleOffset; // 总共需要排除的距离 = 5.5px
      
      // 计算调整后的选择区域（排除边框和 resize handles）
      // 起点（左上角）：向右下移动 totalOffset，排除左边框/上边框和左侧/上方 resize handles
      const adjustedX = selection.x + totalOffset;
      const adjustedY = selection.y + totalOffset;
      
      // 终点（右下角）：向左上移动 totalOffset，即宽度和高度各减少 2 * totalOffset
      // 注意：左右和上下都是完全对称的，都减少 2 * totalOffset
      const adjustedWidth = Math.max(1, selection.width - totalOffset * 2);
      const adjustedHeight = Math.max(1, selection.height - totalOffset * 2);
      
      // 验证：调整后的终点应该等于原始终点减去 totalOffset
      const expectedRight = (selection.x + selection.width) - totalOffset;
      const expectedBottom = (selection.y + selection.height) - totalOffset;
      const actualRight = adjustedX + adjustedWidth;
      const actualBottom = adjustedY + adjustedHeight;
      
      console.log('[AreaSelector] 坐标验证:', {
        originalRight: selection.x + selection.width,
        originalBottom: selection.y + selection.height,
        expectedRight,
        expectedBottom,
        actualRight,
        actualBottom,
        rightMatch: Math.abs(expectedRight - actualRight) < 0.01,
        bottomMatch: Math.abs(expectedBottom - actualBottom) < 0.01
      });
      
      const adjustedSelection = {
        x: adjustedX,        // 起点 X：向右移动 totalOffset，排除左边框和左侧 resize handle
        y: adjustedY,        // 起点 Y：向下移动 totalOffset，排除上边框和上方 resize handle
        width: adjustedWidth,  // 宽度：左右各减少 totalOffset，排除左右边框和 resize handles
        height: adjustedHeight // 高度：上下各减少 totalOffset，排除上下边框和 resize handles
      };
      
      console.log('[AreaSelector] ========== 坐标调整详情 ==========');
      console.log('[AreaSelector] 原始选择框:', {
        x: selection.x,
        y: selection.y,
        width: selection.width,
        height: selection.height,
        right: selection.x + selection.width,  // 原始终点 X
        bottom: selection.y + selection.height // 原始终点 Y
      });
      console.log('[AreaSelector] 边框和 handles 偏移:', {
        borderWidth,
        resizeHandleOffset,
        totalOffset,
        note: '左右和上下都是对称的，都减少 2 * totalOffset'
      });
      console.log('[AreaSelector] 调整后的选择区域:', {
        x: adjustedX,        // 起点 X：向右移动 totalOffset
        y: adjustedY,        // 起点 Y：向下移动 totalOffset
        width: adjustedWidth,
        height: adjustedHeight,
        right: adjustedX + adjustedWidth,   // 调整后的终点 X
        bottom: adjustedY + adjustedHeight, // 调整后的终点 Y
        heightReduction: {
          top: totalOffset,    // 顶部减少 totalOffset
          bottom: totalOffset, // 底部减少 totalOffset（对称）
          total: totalOffset * 2
        }
      });
      console.log('[AreaSelector] 调用 window.electronAPI.areaSelected');
      
      if (window.electronAPI) {
        window.electronAPI.areaSelected(adjustedSelection);
      } else {
        console.error('[AreaSelector] window.electronAPI not available');
      }
      // 为了避免主进程链路异常导致窗口不关闭，这里主动关闭选择器窗口
      try {
        window.close();
      } catch (e) {
        console.warn('[AreaSelector] window.close() failed:', e);
      }
    } else {
      console.warn('[AreaSelector] Invalid selection size');
    }
  };

  const handleCancel = () => {
    console.log('[AreaSelector] Cancel clicked');
    if (window.electronAPI) {
      window.electronAPI.cancelAreaSelection();
    } else {
      console.error('[AreaSelector] window.electronAPI not available');
    }
  };

  // Component mount logging
  useEffect(() => {
    console.log('[AreaSelector] Component mounted');
    console.log('[AreaSelector] window.electronAPI available:', !!window.electronAPI);
    if (window.electronAPI) {
      console.log('[AreaSelector] electronAPI methods:', Object.keys(window.electronAPI));
    }
    return () => {
      console.log('[AreaSelector] Component unmounting');
    };
  }, []);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const calculateDisplayRatio = () => {
    if (selection.width === 0 || selection.height === 0) return '';
    const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
    const divisor = gcd(Math.round(selection.width), Math.round(selection.height));
    const w = Math.round(selection.width / divisor);
    const h = Math.round(selection.height / divisor);
    return `${w}:${h}`;
  };

  return (
    <div
      className="fixed inset-0 cursor-crosshair select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* 半透明遮罩 + 选区高亮（主体背景由系统/其他应用内容提供，因为窗口是透明的） */}
      {/* Selection Box */}
      {selection.width > 0 && selection.height > 0 && (
        <div
          className="selection-box absolute border-4 border-white bg-white/20 shadow-lg pointer-events-none"
          style={{
            left: selection.x,
            top: selection.y,
            width: selection.width,
            height: selection.height,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)'  // Darken outside area
          }}
        >
          {/* Resize Handles */}
          {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(handle => (
            <div
              key={handle}
              data-handle={handle}
              className={`resize-handle absolute w-3 h-3 bg-blue-500 border border-white ${handle.includes('n') ? '-top-1.5' : handle.includes('s') ? '-bottom-1.5' : 'top-1/2 -translate-y-1/2'
                } ${handle.includes('w') ? '-left-1.5' : handle.includes('e') ? '-right-1.5' : 'left-1/2 -translate-x-1/2'
                } ${handle.length === 2 ? (handle === 'nw' || handle === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize') :
                  (handle === 'n' || handle === 's' ? 'cursor-ns-resize' : 'cursor-ew-resize')
                }`}
            />
          ))}

          {/* Dimension Display */}
          <div className="absolute -top-8 left-0 bg-black/80 text-white px-2 py-1 rounded text-xs whitespace-nowrap">
            {Math.round(selection.width)} × {Math.round(selection.height)} ({calculateDisplayRatio()})
          </div>
        </div>
      )}

      {/* Control Panel */}
      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl p-4 flex items-center gap-4 shadow-2xl"
        // 防止点击控制面板（确认/取消/比例按钮）时触发背景的鼠标按下事件
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
      >
        {/* Aspect Ratio Buttons */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/70">宽高比:</span>
          <button
            onClick={() => setAspectRatio('16:9')}
            className={`px-3 py-1 rounded text-xs transition-all ${aspectRatio === '16:9'
              ? 'bg-blue-500 text-white'
              : 'bg-slate-700 text-white/70 hover:bg-slate-600'
              }`}
          >
            16:9 横屏
          </button>
          <button
            onClick={() => setAspectRatio('9:16')}
            className={`px-3 py-1 rounded text-xs transition-all ${aspectRatio === '9:16'
              ? 'bg-blue-500 text-white'
              : 'bg-slate-700 text-white/70 hover:bg-slate-600'
              }`}
          >
            9:16 竖屏
          </button>
          <button
            onClick={() => setAspectRatio('4:3')}
            className={`px-3 py-1 rounded text-xs transition-all ${aspectRatio === '4:3'
              ? 'bg-blue-500 text-white'
              : 'bg-slate-700 text-white/70 hover:bg-slate-600'
              }`}
          >
            4:3
          </button>
          <button
            onClick={() => setAspectRatio('1:1')}
            className={`px-3 py-1 rounded text-xs transition-all ${aspectRatio === '1:1'
              ? 'bg-blue-500 text-white'
              : 'bg-slate-700 text-white/70 hover:bg-slate-600'
              }`}
          >
            1:1 方形
          </button>
          <button
            onClick={() => setAspectRatio('6:7')}
            className={`px-3 py-1 rounded text-xs transition-all ${aspectRatio === '6:7'
              ? 'bg-blue-500 text-white'
              : 'bg-slate-700 text-white/70 hover:bg-slate-600'
              }`}
          >
            6:7
          </button>
          <button
            onClick={() => setAspectRatio('free')}
            className={`px-3 py-1 rounded text-xs transition-all ${aspectRatio === 'free'
              ? 'bg-blue-500 text-white'
              : 'bg-slate-700 text-white/70 hover:bg-slate-600'
              }`}
          >
            自由
          </button>
        </div>

        <div className="w-px h-6 bg-white/10" />

        {/* Action Buttons */}
        <button
          onClick={handleConfirm}
          disabled={selection.width === 0}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-white/30 text-white rounded-lg flex items-center gap-2 transition-all text-sm"
        >
          ✓ 确认
        </button>

        <button
          onClick={handleCancel}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center gap-2 transition-all text-sm"
        >
          ✕ 取消 (ESC)
        </button>
      </div>
    </div>
  );
};

export default AreaSelector;
