module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleFileExtensions: ['js', 'json', 'ts'],
    rootDir: '.',
    testRegex: '.*\\.spec\.ts$',
    transform: {
        '^.+\\.(t|j)s$': ['ts-jest', {
            useESM: true,
            tsconfig: {
                esModuleInterop: true,
                allowSyntheticDefaultImports: true,
            },
        }],
    },
    transformIgnorePatterns: [
        '/node_modules/(?!(@noble|@stellar|@scure|stellar-sdk)/)',
    ],
    moduleNameMapper: {
        '^src/(.*)$': '<rootDir>/src/$1',
        '^@noble/curves/(.+)(?<!\\.js)$': '@noble/curves/$1.js',
    },
    coverageReporters: ['lcov', 'text'],
    coverageDirectory: './coverage',
    coverageThreshold: {
        global: {
            statements: 50,
            branches: 30,
            functions: 40,
            lines: 50,
        },
    },
};
