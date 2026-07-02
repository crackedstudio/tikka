const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
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
];
