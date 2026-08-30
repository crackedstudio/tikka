import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

/**
 * Files that are invoked directly (CLI commands, maintenance scripts, bins)
 * may legitimately talk to a terminal via `console`. Everything else is held
 * to the stricter baseline that discourages stray `console` output.
 */
const CLI_FILES = [
  '**/*.cli.{ts,tsx,js,jsx,mjs,cjs}',
  '**/cli/**/*.{ts,tsx,js,jsx}',
  '**/src/cli/**/*.{ts,tsx,js,jsx}',
  '**/scripts/**/*.{ts,tsx,js,jsx,mjs,cjs}',
  '**/bin/**/*.{ts,tsx,js,jsx,mjs,cjs}',
]

/**
 * The shared, version-aligned baseline applied across every Tikka package.
 *
 * Decisions encoded here, which the whole monorepo agrees on:
 *  - `@typescript-eslint/no-explicit-any`: **warning ratchet** — existing uses
 *    are surfaced and tolerated, new uses should be avoided.
 *  - `no-console`: **warning ratchet** — `console` output is discouraged outside
 *    of explicitly-listed CLI/script/bin files, which turn it off entirely.
 *  - `@typescript-eslint/no-unused-vars`: warning ratchet that ignores `_`-prefixed
 *    variables and arguments (the convention packages already used).
 *
 * Note: ESLint core `js.configs.recommended` is intentionally *not* part of the
 * shared baseline — it is applied by the React variant (which already enforces it)
 * so this change doesn't surface unrelated core-rule failures in the Node services.
 */
export default function base() {
  return tseslint.config(
    { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
    {
      files: ['**/*.{ts,tsx}'],
      extends: [tseslint.configs.recommended, prettier],
      rules: {
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unused-vars': [
          'warn',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        'no-console': 'warn',
      },
    },
    {
      files: CLI_FILES,
      rules: { 'no-console': 'off' },
    },
  )
}