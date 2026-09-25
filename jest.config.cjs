/** @type {import('jest').Config} */
// Root-level Jest config used exclusively for scripts/ tests.
// Package-level tests (sdk, backend, indexer, oracle) each have their own jest config.
module.exports = {
  displayName: 'scripts',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'scripts',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          target: 'ES2020',
          esModuleInterop: true,
          strict: true,
        },
        diagnostics: true,
      },
    ],
  },
  testEnvironment: 'node',
  coverageDirectory: '../coverage/scripts',
  coverageReporters: ['lcov', 'text'],
};
