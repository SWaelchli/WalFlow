import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const wlfPlugin = () => ({
  name: 'vite-plugin-wlf',
  transform(code, id) {
    if (id.endsWith('.wlf')) {
      return {
        code: `export default ${code}`,
        map: null
      }
    }
  }
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), wlfPlugin()],
  build: {
    chunkSizeWarningLimit: 600,   // app chunk is about 565 kB after the split (was 1.27 MB in one file)
    rollupOptions: {
      output: {
        // Libraries change rarely, so they cache separately from the app code (F0-07)
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|decimal\.js-light|es-toolkit|eventemitter3|immer|redux|@reduxjs|reselect|react-redux)[\\/]/.test(id)) return 'vendor-charts';
          if (/node_modules[\\/](reactflow|@reactflow|zustand|classcat)[\\/]/.test(id)) return 'vendor-flow';
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
