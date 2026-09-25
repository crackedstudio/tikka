/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        // Type errors in specs (and their imports) now fail the suite instead
        // of being downgraded to warnings — see #1350.
        diagnostics: true,
      },
    ],
  },
  // stellar-sdk@16 pulls ESM-only deps (@noble/*, uint8array-extras, …).
  // Transform those (and their pnpm-nested copies) so Jest can load them.
  transformIgnorePatterns: [
    '/node_modules/(?!.*(uint8array-extras|@noble|@stellar|@scure|base32\\.js)/)',
  ],
  testEnvironment: 'node',
  coverageReporters: ['lcov', 'text'],
  coverageDirectory: '../coverage',
  coverageThreshold: {
    global: {
      statements: 50,
      branches: 30,
      functions: 40,
      lines: 50,
    },
  },
};
