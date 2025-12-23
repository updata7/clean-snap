import { spawn } from 'child_process';
import waitOn from 'wait-on';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Compiling Electron TypeScript...');
const compile = spawn('pnpm', ['run', 'electron:compile'], { 
  stdio: 'inherit', 
  shell: true 
});

compile.on('close', (code) => {
  if (code !== 0) {
    console.error('Compilation failed');
    process.exit(1);
  }
  
  console.log('Starting Vite dev server...');
  const vite = spawn('pnpm', ['run', 'dev'], { stdio: 'inherit', shell: true });

  waitOn({
    resources: ['http://localhost:3000'],
    timeout: 60000,
  })
    .then(() => {
      console.log('Vite server ready, starting Electron...');
      const electron = spawn('pnpm', ['exec', 'electron', path.join(__dirname, '../electron/main.js')], {
        stdio: 'inherit',
        shell: true,
        env: { 
          ...process.env, 
          ELECTRON: 'true', 
          NODE_ENV: 'development',
        },
      });

      electron.on('close', () => {
        vite.kill();
        process.exit(0);
      });

      vite.on('close', () => {
        electron.kill();
        process.exit(0);
      });
    })
    .catch((err) => {
      console.error('Failed to start:', err);
      vite.kill();
      process.exit(1);
    });
});

compile.on('error', (err) => {
  console.error('Failed to compile:', err);
  process.exit(1);
});
