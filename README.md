# CleanSnap - Cross-Platform Screen Capture Tool

> [中文文档](README.zh-CN.md) | English

A powerful, beautiful screen capture and annotation tool inspired by CleanShot X, with full Windows, macOS, and Linux support.

## Features

### 🎯 Capture Modes
- **Area Selection** - Select any region of your screen
- **Fullscreen Capture** - Capture entire screen
- **Window Capture** - Capture specific windows
- **Scroll Capture** - Coming soon

### ✏️ Advanced Editor
- **Annotation Tools**: Rectangle, Arrow, Pen, Highlighter, Text, Counter, Blur/Pixelate
- **Background Options**: Multiple gradient presets, custom colors, transparent backgrounds
- **AI Integration**: OCR text extraction and image explanation powered by Gemini AI
- **Export Options**: Copy to clipboard, save to disk

### 📹 Screen Recording
- Record screen with system audio
- Microphone audio support
- WebM format output

### 🎨 CleanShot X-like Features
- **Floating Preview** - Quick preview after capture
- **History Panel** - Browse and manage past captures
- **Global Shortcuts** - Quick capture with keyboard shortcuts
- **Auto-save & Copy** - Configurable auto-actions
- **Beautiful UI** - Modern, dark-themed interface

## Installation

### Prerequisites
- node 20+ (suggestion 20.19.6)
- npm or yarn

### Setup

1. **Clone and install dependencies:**
   ```bash
   pnpm install
   ```

2. **Set up Gemini API Key (optional, for AI features):**
   Create a `.env.local` file in the root directory:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

3. **Development Mode:**
   ```bash
   # Web version
   pnpm run dev

   # Electron desktop app
   pnpm run electron:dev
   ```

## Building

### Build for Production

```bash
# Build web version
pnpm run build

# Build Electron app for current platform
pnpm run electron:build

# Build for specific platform
pnpm run electron:build -- --win
pnpm run electron:build -- --mac
pnpm run electron:build -- --linux
```

## Usage

### Keyboard Shortcuts

- `Cmd/Ctrl + Shift + 3` - Capture fullscreen
- `Cmd/Ctrl + Shift + 4` - Capture area (opens selector)
- `Cmd/Ctrl + Shift + 5` - Capture window

### Capture Workflow

1. **Start Capture**: Use keyboard shortcut or click capture button
2. **Select Area**: Drag to select region (if area mode)
3. **Edit**: Annotate, add backgrounds, use AI features
4. **Export**: Copy to clipboard or save to disk

### Editor Tools

- **Select** - Move and select annotations
- **Rectangle** - Draw rectangles
- **Arrow** - Draw arrows
- **Pen** - Freehand drawing
- **Highlighter** - Semi-transparent highlighting
- **Text** - Add text labels
- **Counter** - Numbered markers
- **Blur** - Pixelate/blur regions

## Project Structure

```
cleansnap-web/
├── electron/          # Electron main process
│   ├── main.ts       # Main process entry
│   └── preload.ts    # Preload script
├── components/        # React components
│   ├── Editor.tsx    # Image editor
│   ├── AreaSelector.tsx  # Area selection overlay
│   ├── PreviewWindow.tsx # Floating preview
│   └── HistoryPanel.tsx  # History management
├── services/          # Business logic
│   ├── captureService.ts  # Capture functionality
│   └── geminiService.ts   # AI integration
└── types.ts          # TypeScript definitions
```

## Technology Stack

- **Frontend**: React 19 + TypeScript
- **Build Tool**: Vite
- **Desktop**: Electron
- **Styling**: Tailwind CSS
- **AI**: Google Gemini API

## Platform Support

- ✅ **Windows 10/11** - Full support with native shortcuts (Ctrl+Shift+3/4/5)
- ✅ **macOS 10.15+** - Full support with native shortcuts (Cmd+Shift+3/4/5)
- ✅ **Linux** (Ubuntu, Fedora, etc.) - Full support
- ✅ **Web browsers** - Limited functionality (no global shortcuts, no native capture)

### macOS Specific Features

- Native macOS window styling with vibrancy effects
- Proper dock integration
- macOS-style keyboard shortcuts (Cmd instead of Ctrl)
- Screen recording permissions handled automatically

## Development

### Running in Development

```bash
# Terminal 1: Start Vite dev server
pnpm run dev

# Terminal 2: Start Electron (in another terminal)
pnpm run electron:dev
```

### Project Scripts

- `pnpm run dev` - Start web dev server
- `pnpm run build` - Build web version
- `pnpm run electron:dev` - Run Electron app in dev mode
- `pnpm run electron:build` - Build Electron app
- `pnpm run electron:pack` - Package Electron app

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License

## Acknowledgments

Inspired by [CleanShot X](https://cleanshot.com/) - an amazing macOS screenshot tool.