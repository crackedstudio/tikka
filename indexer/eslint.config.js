const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
  {
    // Package-root tooling config is exempt; every *other* root-level *.js is
    // linted by the block at the bottom of this file (#1479).
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'eslint.config.js',
      'jest.integration.config.js',
    ],
  },
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Pre-existing rot: files use @ts-ignore. Tolerated here so CI can surface
      // other lint regressions. Re-enable after migrating to @ts-expect-error.
      '@typescript-eslint/ban-ts-comment': 'off',
      // Pre-existing rot: a few modules still use CommonJS require(). Disabled
      // so CI doesn't flag it; revisit when those modules are migrated.
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  // Package-root scripts (#1479). Only tooling config belongs at the package
  // root; anything else here is a stray script, and linting it with `no-undef`
  // means a non-runnable stub cannot sit in the tree unnoticed the way
  // replay.js and snapshot.js did.
  {
    files: ['*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        exports: 'writable',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
