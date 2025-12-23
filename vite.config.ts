import { fileURLToPath } from 'url';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read version from package.json
const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));
const appVersion = packageJson.version || '1.0.0';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
  const isElectron = process.env.ELECTRON === 'true';
    
    return {
      // 生产环境（打包给 Electron 使用）强制使用相对路径，避免 file:///assets/... 找不到
      base: mode === 'production' ? './' : '/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
        'process.env.ELECTRON': JSON.stringify(isElectron || false),
        'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
      },
      resolve: {
        alias: {
          '@': __dirname,
        }
      },
      build: {
        outDir: 'dist',
        rollupOptions: isElectron ? {
          input: {
            main: path.resolve(__dirname, 'index.html'),
            selector: path.resolve(__dirname, 'selector.html'),
            preview: path.resolve(__dirname, 'preview.html'),
          }
        } : undefined,
      },
    };
});
