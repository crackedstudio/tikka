/**
 * Dependency Version Check Configuration
 * 
 * Define accepted version mismatches for shared frameworks.
 * Add entries here when intentional version drift is acceptable.
 * 
 * Format:
 * 'framework-name': {
 *   reason: 'explanation',
 *   packages: ['pkg1', 'pkg2'],
 * }
 */

module.exports = {
  allowed: {
    /**
     * NestJS CLI: backend/sdk use 11.0.x for newer features,
     * indexer/oracle use 10.4.x for stability
     */
    '@nestjs/cli': {
      reason: 'Backend and SDK upgraded to NestJS CLI 11 for new features; indexer and oracle remain on 10.4 for stability',
      packages: ['backend', 'sdk', 'indexer', 'oracle'],
    },
    
    /**
     * Jest: backend is on 29.x (legacy), newer packages upgraded to 30.x
     * Allows backend to run with stable Jest while others use latest features
     */
    jest: {
      reason: 'Backend uses Jest 29 for stability; indexer, oracle, and SDK upgraded to Jest 30 for newer features',
      packages: ['backend', 'indexer', 'oracle', 'sdk'],
    },
    
    /**
     * ts-jest: backend on 29.2, others on 29.4+ for Jest 30 compatibility
     */
    'ts-jest': {
      reason: 'Backend uses ts-jest 29.2; others use 29.4+ for compatibility with Jest 30',
      packages: ['backend', 'indexer', 'oracle', 'sdk'],
    },
    
    /**
     * @types/jest: backend on 29.5, others on 30.0 for Jest 30 support
     */
    '@types/jest': {
      reason: 'Backend uses @types/jest 29 for Jest 29; others use 30 for Jest 30 support',
      packages: ['backend', 'indexer', 'oracle', 'sdk'],
    },
    
    /**
     * ESLint: client uses 9.33 (latest in v9 line),
     * backend packages upgraded to 10.x for new rules
     */
    eslint: {
      reason: 'Client uses ESLint 9.33; backend packages upgraded to ESLint 10 for new linting rules',
      packages: ['client', 'indexer', 'oracle', 'sdk'],
    },
    
    /**
     * TypeScript: client uses 5.8.3 (latest),
     * backend packages use 5.6 for stability
     */
    typescript: {
      reason: 'Client upgraded to TypeScript 5.8.3 for latest features; backend packages remain on 5.6 for stability',
      packages: ['backend', 'client', 'indexer', 'oracle', 'sdk'],
    },
    
    /**
     * @stellar/stellar-sdk: patch/minor version differences within same major version
     * backend/client on 14.4.x, others on 14.5.x - acceptable as they are compatible
     */
    '@stellar/stellar-sdk': {
      reason: 'Patch/minor version differences within major 14.x line; backend and client on 14.4.x, others on 14.5.x',
      packages: ['backend', 'client', 'indexer', 'oracle', 'sdk'],
    },
    
    /**
     * fast-check: Different versions for property-based testing
     * backend on pinned 3.22.0, others on newer versions
     */
    'fast-check': {
      reason: 'Backend uses pinned fast-check 3.22.0; client/sdk use 4.7, oracle uses 4.6, indexer uses 3.23.2',
      packages: ['backend', 'client', 'indexer', 'oracle', 'sdk'],
    },
  },
};
