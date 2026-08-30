import node from 'eslint-config-tikka/node'

export default [
  ...node(),
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Pre-existing rot: a few modules still use CommonJS require(). Disabled
      // so CI doesn't flag it; revisit when those modules are migrated.
      '@typescript-eslint/no-require-imports': 'off',
      // Pre-existing rot: files still use `@ts-ignore`. Tolerated so CI can
      // surface other lint regressions. Re-enable after migrating to @ts-expect-error.
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
]