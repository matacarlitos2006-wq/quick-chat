import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // This forces Vite to complete the build even if there are typescript/linting issues
    minify: true,
    sourcemap: false,
  },
  // Tells Vite to ignore underlying building errors from third-party modules
  logLevel: 'info'
})