import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      /*
       * Authentication is its own service, so /api/auth goes somewhere else.
       *
       * This entry must come before '/api' - Vite matches in insertion order
       * and the first prefix match wins, so with '/api' first every auth
       * request would reach the API and 404.
       *
       * In development Vite is doing the routing an nginx gateway does in
       * both container stacks. Keeping it a prefix split, rather than
       * rewriting the path, is deliberate: the auth service mounts its routes
       * at the root and the edge strips the prefix, so this has to strip it
       * too or the two environments would disagree about its URLs.
       */
      '/api/auth': {
        target: 'http://127.0.0.1:5002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/auth/, ''),
      },
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
