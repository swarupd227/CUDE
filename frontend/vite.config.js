import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,          // Expose to network — allows access via IP address
    proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } }
  }
});
