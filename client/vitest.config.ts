import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts',
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    alias: {
      'virtual:pwa-register/react': path.resolve(__dirname, 'src/test-utils/virtual-pwa-register.ts'),
    },
  },
});
