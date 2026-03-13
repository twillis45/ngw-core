import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/static/ui/',
  build: {
    outDir: '../static/ui',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/recommend': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
      '/api': 'http://localhost:8000',
    },
  },
});
