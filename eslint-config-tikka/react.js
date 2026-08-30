import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import base from './base.js'

/**
 * Browser + React variant (used by the client).
 *
 * - Adds ESLint core recommended rules and browser globals. The core `no-undef`,
 *   `no-unused-vars` and `no-redeclare` rules are disabled because they don't
 *   understand TypeScript — `@typescript-eslint` owns those checks (the baseline
 *   also ratchets `@typescript-eslint/no-unused-vars` and `no-explicit-any` as warnings).
 * - Only the two classic React Hooks rules are enabled. Newer stricter rules shipped in
 *   `eslint-plugin-react-hooks` (e.g. set-state-in-effect, refs-during-render) are
 *   intentionally not part of the monorepo baseline so adopting the shared config doesn't
 *   surface a wave of existing-code violations; revisit when enforcing them.
 */
export default function react() {
  return tseslint.config(
    ...base(),
    {
      files: ['**/*.{ts,tsx}'],
      languageOptions: {
        globals: globals.browser,
        ecmaVersion: 2020,
        sourceType: 'module',
      },
      extends: [js.configs.recommended],
      rules: {
        'no-undef': 'off',
        'no-unused-vars': 'off',
        'no-redeclare': 'off',
      },
    },
    {
      files: ['**/*.{ts,tsx}'],
      plugins: { 'react-hooks': reactHooks },
      rules: {
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'warn',
      },
    },
    {
      files: ['**/*.{ts,tsx}'],
      extends: [reactRefresh.configs.vite],
    },
  )
}