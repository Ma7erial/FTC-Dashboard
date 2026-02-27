import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  // environment variables are no longer needed for the AI client
  const env = loadEnv(mode, process.cwd(), '');
  const PORT = env.PORT || '3000';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      allowedHosts: ['firstinspires.junipervirtual.org'],
      proxy: {
        '/api': {
          target: `http://localhost:${PORT}`,
          changeOrigin: true,
        },
        '/uploads': {
          target: `http://localhost:${PORT}`,
          changeOrigin: true,
        }
      }
    },
  };
});
