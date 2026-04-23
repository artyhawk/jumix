/// <reference types="vitest/config" />
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Vitest setup для mobile (M1). Приближение RN через `react-native-web`
 * alias — HTML-рендеринг вместо native primitives. Подходит для unit
 * tests (Button/Input/phone-validation/auth-store); полнота реального
 * RN rendering (жесты, touch, native autofill) — только на device.
 *
 * `expo-router` / `expo-secure-store` / `burnt` замоканы в tests/setup.ts.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'react-native': 'react-native-web',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'app/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
  },
})
