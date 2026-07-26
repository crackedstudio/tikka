/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        isolatedModules: true,
        diagnostics: { warnOnly: true },
      },
    ],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!.*(uint8array-extras|@noble|@stellar|@scure|base32\\.js)/)',
  ],
  testEnvironment: 'node',
};
