# CleanSnap - 跨平台屏幕录制工具

> 中文 | [English](README.md)

一个功能强大、界面美观的屏幕录制和标注工具，灵感来源于 CleanShot X，全面支持 Windows、macOS 和 Linux。

## 功能特性

### 🎯 录制模式
- **区域选择** - 选择屏幕的任意区域进行录制
- **全屏录制** - 录制整个屏幕
- **窗口录制** - 录制特定窗口
- **自定义区域** - 支持多种宽高比（16:9、9:16、4:3、1:1、6:7）或自由选择

### 📹 屏幕录制
- **高质量录制** - 支持高清视频录制，接近无损质量
- **音频录制** - 支持系统音频和麦克风音频
- **摄像头叠加** - 支持在录制画面中叠加摄像头画面
- **实时预览** - 录制前和录制中都可以实时预览
- **多种格式** - 支持导出为 MP4 或 WebM 格式

### ✏️ 高级编辑器
- **标注工具**: 矩形、箭头、画笔、高亮、文本、计数器、模糊/像素化
- **背景选项**: 多种渐变预设、自定义颜色、透明背景
- **AI 集成**: OCR 文本提取和图像说明（由 Gemini AI 提供支持）
- **导出选项**: 复制到剪贴板、保存到磁盘

### 🎨 CleanShot X 风格特性
- **浮动预览** - 捕获后快速预览
- **历史面板** - 浏览和管理历史记录
- **全局快捷键** - 使用键盘快捷键快速捕获
- **自动保存和复制** - 可配置的自动操作
- **美观界面** - 现代化深色主题界面

## 安装

### 前置要求
- Node.js 20+ (建议使用 20.19.6)
- npm 或 pnpm

### 设置

1. **克隆并安装依赖:**
   ```bash
   pnpm install
   ```

2. **设置 Gemini API Key（可选，用于 AI 功能）:**
   在根目录创建 `.env.local` 文件:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

3. **开发模式:**
   ```bash
   # Web 版本
   pnpm run dev

   # Electron 桌面应用
   pnpm run electron:dev
   ```

## 构建

### 生产环境构建

```bash
# 构建 Web 版本
pnpm run build

# 构建 Electron 应用（当前平台）
pnpm run electron:build

# 构建特定平台
pnpm run electron:build -- --win
pnpm run electron:build -- --mac
pnpm run electron:build -- --linux
```

## 使用说明

### 键盘快捷键

- `Cmd/Ctrl + Shift + 3` - 全屏捕获
- `Cmd/Ctrl + Shift + 4` - 区域捕获（打开选择器）
- `Cmd/Ctrl + Shift + 5` - 窗口捕获

### 录制工作流

1. **开始录制**: 使用键盘快捷键或点击录制按钮
2. **选择区域**: 拖动选择区域（如果是区域模式）
3. **调整设置**: 选择音频源、摄像头、格式等
4. **开始录制**: 点击录制按钮开始
5. **停止录制**: 点击停止按钮，选择保存位置

### 编辑器工具

- **选择** - 移动和选择标注
- **矩形** - 绘制矩形
- **箭头** - 绘制箭头
- **画笔** - 自由绘制
- **高亮** - 半透明高亮
- **文本** - 添加文本标签
- **计数器** - 编号标记
- **模糊** - 像素化/模糊区域

## 项目结构

```
clean-snap/
├── electron/          # Electron 主进程
│   ├── main.ts       # 主进程入口
│   └── preload.ts    # 预加载脚本
├── components/        # React 组件
│   ├── Editor.tsx    # 图像编辑器
│   ├── AreaSelector.tsx  # 区域选择覆盖层
│   ├── VideoRecorder.tsx # 视频录制组件
│   ├── PreviewWindow.tsx # 浮动预览
│   └── HistoryPanel.tsx  # 历史管理
├── hooks/            # React Hooks
│   └── useVideoRecorder.ts  # 视频录制逻辑
├── services/          # 业务逻辑
│   ├── captureService.ts  # 捕获功能
│   └── geminiService.ts   # AI 集成
└── utils/            # 工具函数
    ├── performanceOptimizer.ts  # 性能优化
    └── frameBuffer.ts  # 帧缓冲
```

## 技术栈

- **前端**: React 19 + TypeScript
- **构建工具**: Vite
- **桌面应用**: Electron
- **样式**: Tailwind CSS
- **AI**: Google Gemini API
- **视频处理**: FFmpeg

## 平台支持

- ✅ **Windows 10/11** - 完整支持，包含原生快捷键 (Ctrl+Shift+3/4/5)
- ✅ **macOS 10.15+** - 完整支持，包含原生快捷键 (Cmd+Shift+3/4/5)
- ✅ **Linux** (Ubuntu, Fedora 等) - 完整支持
- ✅ **Web 浏览器** - 功能受限（无全局快捷键，无原生捕获）

### macOS 特定功能

- 原生 macOS 窗口样式，带模糊效果
- 正确的 Dock 集成
- macOS 风格键盘快捷键（使用 Cmd 而非 Ctrl）
- 自动处理屏幕录制权限

## 视频质量优化

本项目针对视频质量进行了全面优化：

- **高质量编码**: 使用 CRF 16-20（接近无损质量）
- **高比特率**: 根据分辨率自动调整，最高 12 Mbps
- **原始分辨率**: 保持原始分辨率，不进行自动缩放
- **优化编码参数**: 使用高质量的 x264 编码参数
- **音视频同步**: 优化音视频同步，避免长时间录制时的不同步问题

## 开发

### 开发模式运行

```bash
# 终端 1: 启动 Vite 开发服务器
pnpm run dev

# 终端 2: 启动 Electron（在另一个终端）
pnpm run electron:dev
```

### 项目脚本

- `pnpm run dev` - 启动 Web 开发服务器
- `pnpm run build` - 构建 Web 版本
- `pnpm run electron:dev` - 开发模式运行 Electron 应用
- `pnpm run electron:build` - 构建 Electron 应用
- `pnpm run electron:pack` - 打包 Electron 应用

## 贡献

欢迎贡献！请随时提交 Pull Request。

## 许可证

MIT License

## 致谢

灵感来源于 [CleanShot X](https://cleanshot.com/) - 一款出色的 macOS 截图工具。
