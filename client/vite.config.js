import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // The client never learns the API's origin: in development Vite proxies
      // it, and in production both are served from the same host.
      '/api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      // Socket.IO does not live under /api, so it needs its own entry with
      // websocket upgrades enabled. Without this the client silently falls
      // back to polling against the Vite dev server and never connects.
      '/socket.io': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
