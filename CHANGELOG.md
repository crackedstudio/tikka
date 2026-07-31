# Changelog

All notable changes to the Tikka ecosystem are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/) for the SDK and [Calendar Versioning](https://calver.org/) for apps.

SDK versioning, deprecation windows, and the required release section shape are defined in [sdk/DEPRECATION.md](./sdk/DEPRECATION.md).
Changelog entries are automatically generated from [Changesets](https://github.com/changesets/changesets). See [RELEASE.md](./docs/RELEASE.md) for the full release process.

## [Unreleased]

### Added
- Package-scoped issue templates for consistent contributor guidance
- SDK deprecation policy and changelog section template (`sdk/DEPRECATION.md`)
- Changeset-based changelog automation for the monorepo
- Test restore verification documentation (`docs/backups/TEST_RESTORE.md`)
- Backup workflow failure notifications (Slack + GitHub Issues)
- BullMQ queue metrics export in indexer (`tikka_indexer_queue_*`)
- Audit log query CLI with time-range and event-type filtering
- Audit event retention policy documentation (90-day default)

### Changed
- Updated `docs/RELEASE.md` with changesets workflow and tag scheme
- Improved backup workflow with pre-upload validation and integrity verification

### Fixed
- Supabase Database Backup workflow failure notifications

### Dependencies
- Added `@changesets/cli` and `@changesets/changelog-github` for changelog automation

---

## SDK release template (copy for each `@tikka/sdk` publish)

```markdown
## [sdk-vMAJOR.MINOR.PATCH] - YYYY-MM-DD

### Added
- …

### Changed
- …

### Fixed
- …

### Deprecated
- `SymbolName` — use `Replacement` instead. Removal planned in MAJOR.0.0.
  Migration: …

### Removed
- `SymbolName` — was deprecated in sdk-vX.Y.0. Migration: …

### Security
- …
```

---

## Release History

Releases are tagged by package:
- SDK: `sdk-vMAJOR.MINOR.PATCH`
- Apps: `app-YYYY.MM.PATCH`
- Database: `db-YYYYMMDD_HHMMSS`

See [RELEASE.md](./docs/RELEASE.md) for versioning policy and rollout procedures.
See [sdk/DEPRECATION.md](./sdk/DEPRECATION.md) for SDK semver commitment and deprecation enforcement.
