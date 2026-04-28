module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleFileExtensions: ['js', 'json', 'ts'],
    rootDir: '.',
    testRegex: '.*\\.spec\\.ts$',
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
        'node_modules/(?!(.pnpm/)?(@noble|@stellar|stellar-sdk))',
    ],
    moduleNameMapper: {
        '^src/(.*)$': '<rootDir>/src/$1',
        '^@noble/curves/(.*)(?<!\\.js)$': '@noble/curves/$1.js',
    },
};
