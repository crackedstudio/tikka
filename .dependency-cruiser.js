/**
 * Module boundary rules for the tikka monorepo.
 *
 * Extracted from the `dependency-cruiser` key that used to live in the root
 * `package.json` (#1511), so the rules can carry comments, be read by an IDE,
 * and cover every package rather than only the three boundaries that happened
 * to be written first.
 *
 * Run with:  pnpm run check:boundaries
 * Rationale: docs/contributing/MODULE_BOUNDARIES.md
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    // ---------------------------------------------------------------
    // Package boundaries
    // ---------------------------------------------------------------
    {
      name: 'no-client-to-backend-or-indexer',
      comment:
        'Client must not import from backend/ or indexer/. See docs/contributing/MODULE_BOUNDARIES.md',
      severity: 'error',
      from: { path: '^client/' },
      to: { path: '^(backend|indexer)/' },
    },
    {
      name: 'no-indexer-to-backend',
      comment: 'Indexer must not import from backend/. See docs/contributing/MODULE_BOUNDARIES.md',
      severity: 'error',
      from: { path: '^indexer/' },
      to: { path: '^backend/' },
    },
    {
      name: 'no-sdk-to-app',
      comment:
        'SDK must not import from any app package. See docs/contributing/MODULE_BOUNDARIES.md',
      severity: 'error',
      from: { path: '^sdk/' },
      to: { path: '^(client|backend|indexer|oracle)/' },
    },
    {
      // packages/types is the shared leaf every other package depends on.
      // Importing back out of it invites a dependency cycle across the repo.
      name: 'no-types-to-app',
      comment:
        'packages/types is a leaf package: it must not import any other package in the monorepo. See docs/contributing/MODULE_BOUNDARIES.md',
      severity: 'error',
      from: { path: '^packages/types/' },
      to: {
        path: '^(packages|client|backend|indexer|oracle|sdk)/',
        pathNot: '^packages/types/',
      },
    },
    {
      name: 'no-oracle-to-indexer',
      comment: 'Oracle must not import from indexer/. See docs/contributing/MODULE_BOUNDARIES.md',
      severity: 'error',
      from: { path: '^oracle/' },
      to: { path: '^indexer/' },
    },
    {
      // The indexer's database entities are an implementation detail of its
      // ingestion schema. Anything shared belongs in packages/types instead.
      name: 'no-backend-to-indexer-entities',
      comment:
        'Backend must not import indexer database entities; shared shapes belong in packages/types. See docs/contributing/MODULE_BOUNDARIES.md',
      severity: 'error',
      from: { path: '^backend/' },
      to: { path: '^indexer/src/database/entities/' },
    },

    // ---------------------------------------------------------------
    // Dead files
    // ---------------------------------------------------------------
    {
      // Warn, not error: this rule is being introduced to a repo that has
      // accumulated orphans over time (#1511), so it surfaces candidates for
      // deletion without failing the boundary check on day one. Once the
      // existing set is cleared, this can be promoted to 'error'.
      name: 'no-orphans',
      comment:
        "Orphan module: nothing imports it and it imports nothing, so it is likely dead. If it is intentionally standalone (an entry point, config, or script), add it to this rule's pathNot. See docs/contributing/MODULE_BOUNDARIES.md",
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$', // dot files
          '\\.d\\.ts$', // TypeScript declaration files
          '(^|/)tsconfig[^/]*\\.json$',
          '(^|/)[^/]*(vite|vitest|jest|playwright|eslint|prettier|postcss|tailwind|next|turbo|nest-cli)[^/]*\\.(js|cjs|mjs|ts|json)$',
          '\\.(spec|test|e2e)\\.(ts|tsx|js|jsx)$',
          '(^|/)__(tests|mocks)__/',
          '(^|/)(scripts|test|tests|e2e|migrations)/',
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|build|coverage|\\.next|\\.turbo|node_modules)/' },
    tsPreCompilationDeps: true,
  },
};
