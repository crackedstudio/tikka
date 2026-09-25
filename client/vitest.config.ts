import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // Align the jsdom origin with API_CONFIG.baseUrl (http://localhost:3001) so
    // MSW "/" -relative handler paths resolve to the same origin the app's
    // apiClient sends requests to.
    environmentOptions: {
      url: 'http://localhost:3001/',
    },
    globals: true,
    setupFiles: './src/setupTests.ts',
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov'],
      thresholds: {
        statements: 70,
        branches: 50,
        functions: 60,
        lines: 70,
      },
    },
  },
  resolve: {
    alias: [
      {
        find: 'virtual:pregister/react',
        replacement: path.resolve(__dirname, 'src/test-utils/virtual-pwa-register.ts'),
      },
      // Mirror vite.config.ts: the SDK's dist is never built in client CI, so
      // resolve @tikka/sdk (and subpaths) straight to its source entry.
      {
        find: /^@tikka\/sdk(\/.*)?$/,
        replacement: path.resolve(__dirname, '../sdk/src/index.light.ts'),
      },
    ],
  },
});
