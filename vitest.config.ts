import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/db/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
