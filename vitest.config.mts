import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    env: {
      NODE_ENV: 'test',
      PORT: '3001',
      HOST: '127.0.0.1',
      LOG_LEVEL: 'error',
      DATABASE_URL: 'postgresql://clipdeck:clipdeck_dev@localhost:5432/clipdeck_campaign_test',
      DIRECT_URL: 'postgresql://clipdeck:clipdeck_dev@localhost:5432/clipdeck_campaign_test',
      RABBITMQ_URL: '',
      EVENT_EXCHANGE: 'clipdeck.events',
      JWT_SECRET: 'test-secret-minimum-sixteen-chars',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
      exclude: ['tests/**', 'dist/**', 'prisma/**', 'src/index.ts', 'node_modules/**'],
    },
  },
})
