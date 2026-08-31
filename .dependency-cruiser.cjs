/** @type {import('dependency-cruiser').IConfiguration } */
module.exports = {
  forbidden: [
    {
      name: 'client-not-to-backend-indexer',
      severity: 'error',
      comment: 'Client must not import from backend or indexer (see docs/contributing/MODULE_BOUNDARIES.md)',
      from: { path: '^client/' },
      to: { path: '^(backend|indexer)/' }
    },
    {
      name: 'indexer-not-to-backend',
      severity: 'error',
      comment: 'Indexer must not import from backend (see docs/contributing/MODULE_BOUNDARIES.md)',
      from: { path: '^indexer/' },
      to: { path: '^backend/' }
    },
    {
      name: 'sdk-not-to-app-packages',
      severity: 'error',
      comment: 'SDK must not import from any app package (see docs/contributing/MODULE_BOUNDARIES.md)',
      from: { path: '^sdk/' },
      to: { path: '^(backend|client|indexer)/' }
    }
  ],
  options: {
    doNotFollow: { path: 'node_modules' }
  }
};
