const { build } = require('electron-builder');
const fs = require('fs');
const path = require('path');

// Build TypeScript files first
const { execSync } = require('child_process');

console.log('Building TypeScript files...');
execSync('tsc -p tsconfig.node.json', { stdio: 'inherit' });

// Copy preload.js
const preloadSource = path.join(__dirname, 'preload.ts');
const preloadDest = path.join(__dirname, 'preload.js');
if (fs.existsSync(preloadSource)) {
  // In a real setup, you'd compile this with TypeScript
  console.log('Note: preload.js should be compiled separately');
}

console.log('Building Electron app...');
build({
  config: {
    appId: 'com.cleansnap.app',
    productName: 'CleanSnap',
    directories: {
      output: 'release',
      buildResources: 'build',
    },
    files: [
      'dist/**/*',
      'dist-electron/**/*',
      'package.json',
    ],
    win: {
      target: ['nsis'],
      icon: 'build/icon.ico',
    },
    mac: {
      target: ['dmg'],
      icon: 'build/icon.icns',
    },
    linux: {
      target: ['AppImage'],
      icon: 'build/icon.png',
    },
  },
}).then(() => {
  console.log('Build complete!');
}).catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});

