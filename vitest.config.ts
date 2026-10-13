import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['html', 'text'],
      thresholds: {
        'src/http/**': {
          lines: 90,
          statements: 90,
          branches: 90,
          functions: 90,
        },
        'src/client.ts': {
          lines: 90,
          statements: 90,
          branches: 90,
          functions: 90,
        },
        'src/errors.ts': {
          lines: 90,
          statements: 90,
          branches: 90,
          functions: 90,
        },
      },
    },
  },
});
