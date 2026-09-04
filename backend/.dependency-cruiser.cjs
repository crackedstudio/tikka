module.exports = {
  forbidden: [
    {
      name: 'no-backend-indexer-entity-imports',
      severity: 'error',
      comment: 'Backend must not import indexer entity classes (ownership boundary)',
      from: { path: '^src' },
      to: { path: 'indexer/src/database/entities' }
    }
  ]
};