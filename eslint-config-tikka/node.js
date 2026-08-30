import globals from 'globals'
import base from './base.js'

/**
 * Node + TypeScript runtime variant (used by sdk, backend, indexer, oracle).
 * Adds NodeJS global identifiers so core rules like `no-undef` don't flag
 * `process`, `require`, `__dirname`, etc.
 */
export default function node() {
  return [
    ...base(),
    {
      files: ['**/*.{ts,tsx}'],
      languageOptions: {
        globals: globals.node,
        sourceType: 'module',
      },
    },
  ]
}