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
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
