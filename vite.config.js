// Vite config: React plugin, and a dev proxy so the browser talks to the API on one origin.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: {
      '/api': 'http://127.0.0.1:4100',
    },
  },
});
