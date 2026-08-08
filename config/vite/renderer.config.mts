import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const workspaceRoot = path.resolve(import.meta.dirname, '../..');

export default defineConfig({
  root: path.resolve(workspaceRoot, 'src/renderer'),
  build: {
    outDir: path.resolve(
      workspaceRoot,
      '.vite/renderer/main_window',
    ),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(workspaceRoot, 'src/renderer'),
    },
  },
});
