import { defineConfig } from 'vitest/config'

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
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
