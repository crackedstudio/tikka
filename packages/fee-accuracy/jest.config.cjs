/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        diagnostics: true,
      },
    ],
  },
  testEnvironment: 'node',
  coverageReporters: ['lcov', 'text'],
  coverageDirectory: '../coverage',
  // The harness is the gate both the SDK and the oracle depend on, so its own
  // coverage floor is enforced rather than assumed.
  collectCoverageFrom: ['**/*.ts', '!*.spec.ts', '!index.ts'],
  coverageThreshold: {
    global: {
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90,
    },
  },
};
