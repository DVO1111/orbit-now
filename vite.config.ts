import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works on GitHub Pages (or any sub-path) unchanged.
export default defineConfig({
  base: './',
  plugins: [react()],
  // satellite.js ships an optional WASM worker that uses top-level await.
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 1200 }, // three.js alone is ~600 kB
});
