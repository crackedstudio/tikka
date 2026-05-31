# Release Policy

This document defines versioning, changelog, and deployment procedures for the Tikka ecosystem.

## Versioning

### SDK (`@tikka/sdk`)
- **Semantic Versioning**: `MAJOR.MINOR.PATCH`
- **MAJOR**: Breaking changes to public APIs (Raffle, Ticket, Wallet, User, Network, Utils modules)
- **MINOR**: New features, non-breaking additions
- **PATCH**: Bug fixes, internal improvements
- **Pre-release**: `0.x.y` during development; increment MINOR for feature releases

### Apps (Client, Backend, Indexer, Oracle)
- **Calendar Versioning**: `YYYY.MM.PATCH`
- **YYYY.MM**: Release date (e.g., `2026.05.0`)
- **PATCH**: Hotfixes within the same month
- No pre-release versions; deploy directly to staging/production

### Database Migrations
- Versioned by timestamp: `YYYYMMDD_HHMMSS_description.sql`
- Must be reversible (include rollback logic)
- Deployed independently of app versions

## Release Types

### SDK Release
1. Update version in `sdk/package.json`
2. Add entry to `CHANGELOG.md` (see template below)
3. Tag commit: `sdk-v0.1.0`
4. Publish to npm: `npm publish` (from `sdk/` directory)
5. Update TypeDoc: `npm run docs`

### App Release (Client, Backend, Indexer, Oracle)
1. Update version in package.json (if applicable)
2. Add entry to `CHANGELOG.md`
3. Tag commit: `app-YYYY.MM.PATCH` (e.g., `app-2026.05.0`)
4. Deploy to staging, run integration tests
5. Deploy to production

### Database Migration
1. Create migration file in `backend/migrations/`
2. Include rollback procedure in comments
3. Test locally: `npm run migrate:up` and `npm run migrate:down`
4. Deploy before app release
5. Document in `CHANGELOG.md`

## Changelog Template

Create entries in `CHANGELOG.md` at the root:

```markdown
## [0.1.0] - 2026-05-28

### Added
- New feature description

### Changed
- Breaking change or significant modification

### Fixed
- Bug fix description

### Deprecated
- Deprecated API or feature

### Removed
- Removed feature or API

### Migration
- Database schema changes
- Rollback procedure (if applicable)

### Dependencies
- Updated or added dependencies
```

## Rollout Checklist

### SDK
- [ ] Tests pass (`npm test`)
- [ ] TypeDoc builds (`npm run docs`)
- [ ] No breaking changes to public APIs, or MAJOR version bumped
- [ ] Changelog entry added
- [ ] npm publish succeeds

### Apps
- [ ] All package tests pass
- [ ] Root build passes
- [ ] Database migrations tested (if applicable)
- [ ] Staging deployment successful
- [ ] Integration tests pass
- [ ] Changelog entry added
- [ ] Production deployment scheduled

### Database
- [ ] Migration is reversible
- [ ] Rollback tested locally
- [ ] No data loss in rollback
- [ ] Deployed before app release

## Rollback Procedure

### SDK
```bash
npm unpublish @tikka/sdk@0.1.0
git revert <commit-hash>
git push
```

### Apps
- Revert to previous tag: `git revert <tag>`
- Redeploy previous version
- Notify team of rollback reason

### Database
- Run rollback migration: `npm run migrate:down`
- Verify data integrity
- Redeploy app if needed

## Cross-Package Releases

When multiple packages release together:
1. Coordinate versions and changelog entries
2. Tag all commits with a release date: `release-2026.05.28`
3. Deploy in order: Database → Backend → Indexer/Oracle → Client
4. Verify each step before proceeding
5. Document in main `CHANGELOG.md`

## Versioning in Code

### SDK
- Update `sdk/package.json` version
- TypeDoc automatically reflects version in generated docs
- Public APIs should reference version in JSDoc comments for breaking changes

### Apps
- Update `package.json` version (if applicable)
- Include version in deployment metadata (e.g., Docker image tags)
- Log version on startup for debugging

## References

- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [Calendar Versioning](https://calver.org/)
