import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      reporter: ['text-summary', 'json-summary'],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
});
