import react from 'eslint-config-tikka/react'

export default [
  ...react(),
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Pre-existing rot: the app exports extra members (constants, types) from
      // component modules. Tolerated until those modules are refactored.
      'react-refresh/only-export-components': 'off',
    },
  },
]