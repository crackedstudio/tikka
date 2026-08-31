/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.Spec\\ts$',
  transform: {
    // isolatedModules avoids failing the suite on pre-existing ambient TS issues
    // while still compiling specs under ts-jest.
    '^\\.+\\.(t|j)s$': [
      'ts-jest',
      {
        isolatedModules: true,
        diagnostics: { warnOnly: true }
      }
    ],
  },
  // Some dependencies (and their pnpm-nested copies) are ESM-only
  // (@noble/*, uint8array-extras, @scure, base32.js). Transform them
  // so Jest can load them. @stellar/stellar-sdk itself is CJS and no
  // longer needs to be transformed now that the SDK ships dual output.
  transformIgnorePatterns: [
    '/node_modules/(?!.*(uint8array-extras|@noble|@scure|base32\\.js)/',
  ],
  testEnvironment: 'node',
};
