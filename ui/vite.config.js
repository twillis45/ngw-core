import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// When running make run-https, set BACKEND_HTTPS=1 so the Vite proxy
// connects to the TLS backend.  Falls back to plain HTTP for make run.
const backendBase = process.env.BACKEND_HTTPS === '1'
  ? 'https://localhost:8000'
  : 'http://localhost:8000';

const proxyTarget = { target: backendBase, secure: false, changeOrigin: true };

export default defineConfig({
  plugins: [react()],
  base: '/static/ui/',
  build: {
    outDir: '../static/ui',
    emptyOutDir: true,
  },
  server: {
    port: parseInt(process.env.PORT || '5173'),
    host: true,
    proxy: {
      '/recommend':    proxyTarget,
      '/health':       proxyTarget,
      '/api':          proxyTarget,
      '/static/debug': proxyTarget,
    },
  },
});
