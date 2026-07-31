/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    // isolatedModules avoids failing the suite on pre-existing ambient TS issues
    // while still compiling specs under ts-jest.
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        isolatedModules: true,
        diagnostics: { warnOnly: true },
      },
    ],
  },
  // stellar-sdk@16 pulls ESM-only deps (@noble/*, uint8array-extras, …).
  // Transform those (and their pnpm-nested copies) so Jest can load them.
  transformIgnorePatterns: [
    '/node_modules/(?!.*(uint8array-extras|@noble|@stellar|@scure|base32\\.js)/)',
  ],
  testEnvironment: 'node',
};
