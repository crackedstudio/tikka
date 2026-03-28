/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.integration\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',

  /**
   * Testcontainers pulls a Docker image and starts a PostgreSQL container.
   * Container startup + migration run takes ~30s on first pull; allow 3 minutes.
   */
  testTimeout: 180_000,

  /**
   * Run integration suites serially to avoid multiple containers competing for
   * the same host ports.
   */
  maxWorkers: 1,

  globalSetup: undefined,
  globalTeardown: undefined,

  /**
   * Show slow tests — integration tests that exceed 10 s get flagged.
   */
  slowTestThreshold: 10_000,
};
