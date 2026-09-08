module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'client',
        'sdk',
        'backend',
        'indexer',
        'oracle',
        'repo',
        'docs',
      ],
    ],
    'scope-empty': [2, 'never'],
  },
};
