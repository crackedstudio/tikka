module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleFileExtensions: ['js', 'json', 'ts'],
    rootDir: '.',
    testRegex: '.*\\.spec\\.ts$',
    transform: {
        '^.+\\.(t|j)s$': 'ts-jest',
    },
    transformIgnorePatterns: [
        // Transform ESM modules from @noble and @stellar packages
        'node_modules/(?!(@noble|@stellar|stellar-sdk)/)',
    ],
    moduleNameMapper: {
        '^src/(.*)$': '<rootDir>/src/$1',
    },
    globals: {
        'ts-jest': {
            tsconfig: {
                esModuleInterop: true,
                allowSyntheticDefaultImports: true,
            },
        },
    },
};
