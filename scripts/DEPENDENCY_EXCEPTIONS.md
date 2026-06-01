# Dependency Version Management

This document outlines how we manage dependency versions across the Tikka monorepo and the policies for handling version mismatches.

## Overview

Packages in the Tikka monorepo use different versions of key frameworks intentionally:
- Different packages may have different NestJS, Jest, ESLint, TypeScript, Stellar SDK, and fast-check versions
- Version drift should be **intentional and documented**

This allows each package to use versions optimized for its specific needs without forcing unnecessary upgrades across the entire monorepo.

## Checking Dependency Versions

Use the dependency version checker to identify cross-package version mismatches:

```bash
node scripts/check-dependencies.js
```

This script will:
1. Report all key dependency versions across packages
2. Flag major-version mismatches for shared frameworks
3. Show which mismatches are accepted exceptions
4. Exit with error code 1 if unflagged mismatches are found

## Acceptance Criteria for Version Drift

Before allowing a version mismatch, ensure:
1. **Intentional**: The difference serves a specific purpose (e.g., framework compatibility)
2. **Documented**: The reason is clearly explained in `dependency-config.js`
3. **Isolated**: The mismatch doesn't prevent cross-package communication
4. **Tracked**: The exception is recorded in version control

## Adding an Accepted Exception

When a version mismatch is intentional and acceptable, add it to `dependency-config.js`:

```javascript
module.exports = {
  allowed: {
    '@nestjs/common': {
      reason: 'Oracle uses NestJS 10 for compatibility with legacy Bull job queue, backend uses 11',
      packages: ['oracle', 'backend'],
    },
    'fast-check': {
      reason: 'Oracle uses fast-check 4 for property-based testing, SDK uses 3 for size constraints',
      packages: ['oracle', 'sdk'],
    },
  },
};
```

## CI Integration

The script is designed for CI pipelines:
- Clean, structured output with section headers
- ✓/❌ indicators for quick scanning
- Exit code 1 on unflagged mismatches (fails the build)
- Exit code 0 on success (all mismatches documented)

### Suggested CI Usage

Add to your CI pipeline (GitHub Actions example):

```yaml
- name: Check dependency versions
  run: node scripts/check-dependencies.js
```

## Package-Specific Notes

### backend (tikka-backend)
- **NestJS**: ^10.4.0
- **TypeScript**: ^5.4.5
- **Jest**: ^29.7.0
- **ESLint**: ^8.57.0

### client (tikka)
- **React**: ^19.2.0
- **TypeScript**: ^5.6.0 (or later)
- **Vite**: ^5.x
- **ESLint**: ^9.33.0
- **Playwright**: ^1.43.0

### indexer (tikka-indexer)
- **NestJS**: ^10.4.0
- **TypeScript**: ^5.4.5
- **Jest**: ^29.7.0
- **ESLint**: ^8.57.0

### oracle (tikka-oracle)
- **NestJS**: ^10.4.0
- **TypeScript**: ^5.6.0
- **Jest**: ^30.3.0
- **ESLint**: ^10.0.2
- **fast-check**: ^4.6.0

### sdk (@tikka/sdk)
- **NestJS**: ^10.4.0
- **TypeScript**: ^5.6.0
- **Jest**: ^30.0.0
- **ESLint**: ^9.x
- **@stellar/stellar-sdk**: ^14.5.0

## Stellar SDK Versions

The @stellar/stellar-sdk has minor version variations across packages:
- **backend**: ^14.4.0
- **client**: ^14.4.3
- **indexer**: Not directly used
- **oracle**: ^14.5.0
- **sdk**: ^14.5.0

This is acceptable as they are patch/minor version differences within the same major version.

## Dealing with Version Mismatches

### Scenario 1: Unintentional Mismatch
If you discover a mismatch that wasn't planned:
1. Decide which version is "correct"
2. Update the other packages to match
3. Run `node scripts/check-dependencies.js` to verify
4. Commit the changes

### Scenario 2: Intentional Mismatch
If you're updating a framework version in one package:
1. Make the update
2. Run `node scripts/check-dependencies.js` to identify the mismatch
3. Add the mismatch to `dependency-config.js` with a reason
4. Document the reason for future maintainers
5. Commit both files together

### Scenario 3: Drift Over Time
If package versions drift significantly over time:
1. Run `node scripts/check-dependencies.js` regularly
2. Review mismatches quarterly
3. Sync versions where practical (avoid breaking changes)
4. Update `dependency-config.js` to reflect current reality

## Related Processes

- **Dependency Updates**: See `DEPENDENCY_UPDATES.md` for policies on updating dependencies
- **Testing**: Run affected package checks when dependencies change
- **Release**: Verify no critical mismatches before cutting a release

## FAQ

**Q: Why not just sync all versions?**
A: Different packages have different constraints. Client needs React, backend doesn't. Oracle needs property-based testing, frontend doesn't.

**Q: What if a mismatch causes bugs?**
A: Bugs from version incompatibility should trigger a version sync for those packages, not an exception.

**Q: How often should we check?**
A: After every significant dependency update, and as part of pre-release checks.
