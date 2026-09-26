import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'react-refresh/only-export-components': 'off',
      'no-console': 'error',
      // `src/context/` held a second, dead `WalletProvider` that nothing
      // imported; it was removed in #1525. Provider components belong in
      // `src/providers/`, so importing one from a `context/` directory is
      // rejected instead of silently re-introducing a third provider state layer.
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/context/WalletProvider', '**/context/WalletProvider.*'],
            message: 'WalletProvider lives in src/providers/WalletProvider.tsx (see #1525).',
          },
          {
            group: ['**/context/*Provider', '**/context/*Provider.*'],
            message: 'Providers must live in src/providers/, not src/context/ (see #1525).',
          },
        ],
      }],
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    files: ['src/utils/logger.ts'],
    rules: {
      'no-console': 'off'
    }
  }
])
