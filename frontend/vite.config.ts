import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  envDir: '..',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    allowedHosts: true,
    host: false,
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8006',
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
