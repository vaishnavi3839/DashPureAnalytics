import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, Vite proxies REST and WebSocket traffic to the Express backend,
// so the frontend uses relative URLs (/api, /ws) in every environment.
const BACKEND = process.env.BACKEND_URL || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': BACKEND,
      '/ws': { target: BACKEND.replace(/^http/, 'ws'), ws: true },
    },
  },
});
