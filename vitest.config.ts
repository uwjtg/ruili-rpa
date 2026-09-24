import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/renderer/src/data/**', 'src/renderer/src/components/**', 'src/shared/**', 'src/engine/**']
    }
  }
})
