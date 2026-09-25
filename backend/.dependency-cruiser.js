/**
 * Dependency-cruiser rules for the backend package.
 *
 * These rules enforce the module boundaries documented in
 * `docs/contributing/MODULE_BOUNDARIES.md`. Run with `pnpm run boundaries`.
 *
 * The key rule is the backend ↔ indexer anti-corruption layer (issue #1343):
 * the raw indexer wire shapes live only in `src/services/indexer/indexer-api.types`,
 * and only modules inside `src/services/indexer/` may import them. Everything
 * else must consume the backend-owned response types from `indexer.types`.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-indexer-row-shapes-outside-boundary',
      comment:
        'Raw indexer API shapes (src/services/indexer/indexer-api.types) may only be imported from within the indexer anti-corruption layer (src/services/indexer/). Consumers outside must use the backend-owned response types from src/services/indexer/indexer.types. See docs/contributing/MODULE_BOUNDARIES.md.',
      severity: 'error',
      from: {
        pathNot: '^src/services/indexer/',
      },
      to: {
        path: '^src/services/indexer/indexer-api\\.types',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
