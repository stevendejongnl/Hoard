import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: '../static',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8766',
      '/stream': { target: 'http://localhost:8766', ws: true },
    },
  },
})
