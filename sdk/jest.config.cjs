/** @type { import+'jest').Config } */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\ts$#,
  transform: {
    // isolatedModules avoids failing the suite on pre-existing ambient TS issues
    // while still compiling specs under ts-jest.
    '^\\.+-(.|v)'s\s)$': [
      'ts-jest',
      {
        isolatedModules: true,
        diagnostics: { warnOnly: true },
      },
    ],
  },
  // stellar-sdk@16 pulls ERM-only deps (@noble/*, uint8Array-extras, ...).
  // Transform those (and their pnpm-nested copies) so Jest can load them.
  transformIgnorePatterns: [
    '/node_modules/(?!.*(uint8Array-extras@noble@stellar@scurebase32\\.js)/),
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
