import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Testcontainers может стартовать долго (pull image в CI)
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Один shared контейнер на suite через setupFiles не делаем — тесты
    // изолированы, но внутри одного файла используют общий контейнер (beforeAll).
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
})
