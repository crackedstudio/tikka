# Release Policy

This document defines versioning, changelog, and deployment procedures for the Tikka ecosystem.

## Versioning

### SDK (`@tikka/sdk`)
- **Semantic Versioning**: `MAJOR.MINOR.PATCH`
- **MAJOR**: Breaking changes to public APIs (Raffle, Ticket, Wallet, User, Network, Utils modules)
- **MINOR**: New features, non-breaking additions, **or** marking public API as deprecated
- **PATCH**: Bug fixes, internal improvements
- **Pre-release**: `0.x.y` during development; increment MINOR for feature releases
- **Deprecation**: Announce via JSDoc `@deprecated` + `CHANGELOG` `### Deprecated`, keep for at least one MINOR cycle, remove only in a subsequent MAJOR (see [sdk/DEPRECATION.md](../sdk/DEPRECATION.md))

### Apps (Client, Backend, Indexer, Oracle)
- **Calendar Versioning**: `YYYY.MM.PATCH`
- **YYYY.MM**: Release date (e.g., `2026.05.0`)
- **PATCH**: Hotfixes within the same month
- No pre-release versions; deploy directly to staging/production

### Database Migrations
- Versioned by timestamp: `YYYYMMDD_HHMMSS_description.sql`
- Must be reversible (include rollback logic)
- Deployed independently of app versions

## Changelog Automation (Changesets)

This monorepo uses [Changesets](https://github.com/changesets/changesets) to manage versioning and changelog generation.

### How It Works

1. **Developer creates a changeset** when making a change:
   ```bash
   pnpm changeset
   ```
   This creates a markdown file in `.changeset/` describing the change and its semver bump type.

2. **Changesets are committed** with the PR code.

3. **CI bot (changeset-bot)** comments on PRs missing changesets.

4. **On merge to master**, the `changesets/action` creates/updates a "Version Packages" PR that:
   - Bumps versions in `package.json` files
   - Updates `CHANGELOG.md` entries
   - When merged, tags the release and publishes to npm (SDK only)

### Creating a Changeset

```bash
# Interactive prompt
pnpm changeset

# Select the package to version
# Choose bump type: patch / minor / major
# Write a summary of the changes (this becomes the CHANGELOG entry)
```

### Changeset File Format

Each changeset is a markdown file in `.changeset/`:

```markdown
---
"@tikka/sdk": minor
"tikka-backend": patch
---

Add new raffle metadata endpoint for mobile clients.
```

### Version Packages PR

The `changesets/action` GitHub Action automatically creates a PR titled "Version Packages" when changesets accumulate on `master`. Merging this PR:
- Bumps versions in all affected `package.json` files
- Generates `CHANGELOG.md` entries from changeset files
- Removes consumed `.changeset/*.md` files
- Tags the commit with the release version

### Manual Release (Fallback)

If the automated flow is unavailable:

```bash
# Consume all changesets and bump versions
pnpm changeset version

# Review generated CHANGELOG.md entries
git add -A
git commit -m "Version Packages"
git tag sdk-v0.2.0  # or appropriate tag

# Publish SDK to npm
cd sdk && npm publish
```

## Release Types

### SDK Release (Automated)

1. Create changesets for each user-facing change
2. Push to master; "Version Packages" PR is created automatically
3. Review and merge the PR
4. CI tags and publishes to npm

### SDK Release (Manual)

1. Update version in `sdk/package.json`
2. Add entry to `CHANGELOG.md` using the [SDK section template](../sdk/DEPRECATION.md#sdk-changelog-section-template) (also summarized below)
3. Confirm deprecations/removals follow [sdk/DEPRECATION.md](../sdk/DEPRECATION.md)
4. Tag commit: `sdk-v0.1.0`
5. Publish to npm: `npm publish` (from `sdk/` directory)
6. Update TypeDoc: `npm run docs`

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

Entries are auto-generated from changeset files. Manual entries (if needed):

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

## Tag Scheme

| Package | Tag Format | Example |
|---------|-----------|---------|
| SDK | `sdk-vMAJOR.MINOR.PATCH` | `sdk-v0.2.0` |
| Client | `app-YYYY.MM.PATCH` | `app-2026.05.0` |
| Backend | `app-YYYY.MM.PATCH` | `app-2026.05.0` |
| Indexer | `app-YYYY.MM.PATCH` | `app-2026.05.0` |
| Oracle | `app-YYYY.MM.PATCH` | `app-2026.05.0` |
| Database | `db-YYYYMMDD_HHMMSS` | `db-20260528_143000` |

## Docs Deployment

The `docs.yml` workflow deploys SDK documentation to GitHub Pages when:
- Code is pushed to `master` branch, OR
- An **SDK tag** (`sdk-v*`) is pushed

**Important**: Docs only deploy for SDK tags. App or database tags do not trigger a docs deploy.

## Rollout Checklist

### SDK
- [ ] Changesets created for all user-facing changes
- [ ] Tests pass (`npm test`)
- [ ] TypeDoc builds (`npm run docs`)
- [ ] No breaking changes to public APIs, or MAJOR version bumped
- [ ] "Version Packages" PR reviewed and merged

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
- [Changesets](https://github.com/changesets/changesets)
