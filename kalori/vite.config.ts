import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Development only: the frontend calls relative `/api` paths, which Vite
    // forwards to the Express server. In production the same paths are served
    // by the Vercel API function, so no base URL or env var is needed.
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: false,
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
      },
    },
  },
})
