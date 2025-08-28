#!/usr/bin/env node

// Alternative startup script that avoids tsx entirely
import { spawn } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

console.log('Starting development server (avoiding tsx)...');

// Method 1: Try using node with --import tsx/esm (Node v20+ syntax)
const child = spawn('node', [
  '--import', 'tsx/esm',
  'server/index.ts'
], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'development',
    TSX_DISABLE_IPC: '1'
  }
});

child.on('error', (err) => {
  console.error('Failed to start process:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

process.on('SIGINT', () => {
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});