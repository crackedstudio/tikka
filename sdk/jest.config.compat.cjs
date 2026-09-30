/**
 * Jest configuration for the @stellar/stellar-sdk compatibility matrix.
 *
 * Used by .github/workflows/sdk-compat.yml to run the SDK unit-test suite
 * against each supported stellar-sdk major version.  The regular
 * jest.config.cjs is used for the standard "one version" CI path; this file
 * overrides only the pieces that differ across versions.
 *
 * Key difference vs jest.config.cjs:
 *  - transformIgnorePatterns is widened to cover packages that appear in
 *    stellar-sdk v16's dependency tree (@noble/*, @scure/*, uint8array-extras)
 *    but are absent or CJS-only in v14.  Widening is safe for older versions
 *    because ts-jest simply won't encounter those packages.
 *  - diagnostics are kept on (same as base config) so type errors surface
 *    immediately in the matrix run.
 */

/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  // Exclude testnet/integration specs — they need live RPC access.
  testPathIgnorePatterns: ['/node_modules/', '/test/integration/', 'testnet-smoke\\.spec\\.ts$'],
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        diagnostics: true,
      },
    ],
  },
  // Covers ESM-only deps in stellar-sdk v16 (uint8array-extras, @noble/*, @scure/*,
  // @stellar/*) and their pnpm-nested copies.  Harmless on v14 where those
  // packages are absent or already CJS.
  transformIgnorePatterns: [
    '/node_modules/(?!.*(uint8array-extras|@noble|@stellar|@scure|base32\\.js)/)',
  ],
  testEnvironment: 'node',
  coverageReporters: ['lcov', 'text'],
  coverageDirectory: '../coverage',
};
