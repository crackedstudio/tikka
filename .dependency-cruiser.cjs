/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'client-not-to-backend-indexer',
      severity: 'error',
      comment: 'Client must not import from backend or indexer. See docs/contributing/MODULE_BOUNDARIES.md',
      from: { path: '^client/' },
      to: { path: '^(backend|indexer)/' }
    },
    {
      name: 'indexer-not-to-backend',
      severity: 'error',
      comment: 'Indexer must not import from backend. See docs/contributing/MODULE_BOUNDARIES.md',
      from: { path: '^indexer/' },
      to: { path: '^backend/' }
    },
    {
      name: 'sdk-not-to-app-packages',
      severity: 'error',
      comment: 'SDK must not import from any app package. See docs/contributing/MODULE_BOUNDARIES.md',
      from: { path: '^sdk/' },
      to: { path: '^(client|backend|indexer|oracle)/' }
    },
    {
      name: 'shared-package-not-to-app-packages',
      severity: 'error',
      comment:
        'packages/* are shared libraries and must stay independent of the applications that consume them. Importing an app package here inverts the dependency direction and drags a whole application into every consumer. See docs/contributing/MODULE_BOUNDARIES.md',
      from: { path: '^packages/' },
      to: { path: '^(client|backend|indexer|oracle|sdk)/' }
    },
    {
      name: 'oracle-not-to-indexer',
      severity: 'error',
      comment:
        'Oracle delivers randomness and contract callbacks; it must not reach into the indexer query layer. If oracle needs indexed state, that data belongs in a shared package or behind a backend endpoint. See docs/contributing/MODULE_BOUNDARIES.md',
      from: { path: '^oracle/' },
      to: { path: '^indexer/' }
    },
    {
      name: 'no-stellar-sdk-in-shared-packages',
      severity: 'error',
      comment:
        'Shared packages stay chain-agnostic: anything that needs chain primitives depends on @tikka/sdk, which is the single wrapper around @stellar/stellar-sdk. See docs/contributing/MODULE_BOUNDARIES.md',
      from: { path: '^packages/' },
      to: { path: '@stellar/stellar-sdk' }
    }
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|coverage)/' }
  }
};
