import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'node:url';

// Resolve @tikka/sdk straight to its light source entry, mirroring vite.config.ts.
// The SDK's package.json exports map points only at dist/, which is never built by
// client CI, so without this alias Vitest falls back to the unresolved workspace
// symlink and every spec importing `@tikka/sdk` (sdkClient.spec, the
// transactionPipeline specs) fails with "Failed to resolve entry for package
// \"@tikka/sdk\"".
const sdkLightSource = fileURLToPath(new URL('../sdk/src/index.light.ts', import.meta.url));

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
      ...['contract', 'events', 'raffle', 'ticket', 'user'].map((subpath) => ({
        find: `@tikka/types/${subpath}`,
        replacement: path.resolve(__dirname, `../packages/types/src/${subpath}.ts`),
      })),
      {
        find: '@tikka/types',
        replacement: path.resolve(__dirname, '../packages/types/src/index.ts'),
      },
    ],
  },
});
