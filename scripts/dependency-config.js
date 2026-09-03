
    
    /**
     * fast-check: Different versions for property-based testing
     * backend on pinned 3.22.0, others on newer versions
     */
    'fast-check': {
      reason: 'Backend uses pinned fast-check 3.22.0; client/sdk use 4.7, oracle uses 4.6, indexer uses 3.23.2',
      packages: ['backend', 'client', 'indexer', 'oracle', 'sdk'],
    },
    
    /**
     * typeorm: Major version mismatch requiring coordinated migration
     * backend on 0.3.x, indexer on 1.1.x
     */
    'typeorm': {
      reason: 'Backend uses TypeORM 0.3.x; indexer upgraded to 1.1.x; major migration pending for backend',
      packages: ['backend', 'indexer'],
    },
  },
  
  /**
   * Must-match dependencies: these should use the same version across all packages
   * that depend on them to ensure compatibility and shared schema definitions.
   */
  mustMatch: [
    'zod', // Schema validation - must match to share schemas across packages
  ],
};
