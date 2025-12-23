// CommonJS wrapper for Electron main process
// Use ts-node to compile TypeScript on the fly

try {
  // Try to use ts-node
  require('ts-node').register({
    transpileOnly: true,
    compilerOptions: {
      module: 'commonjs',
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      skipLibCheck: true,
    },
  });
  
  // Load the main TypeScript file
  require('./main.ts');
} catch (error) {
  console.error('Failed to load TypeScript:', error);
  console.error('Please ensure ts-node is installed: npm install -D ts-node');
  process.exit(1);
}
