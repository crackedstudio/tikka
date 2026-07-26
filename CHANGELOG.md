# Changelog

All notable changes to the Tikka ecosystem are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/) for the SDK and [Calendar Versioning](https://calver.org/) for apps.

SDK versioning, deprecation windows, and the required release section shape are defined in [sdk/DEPRECATION.md](./sdk/DEPRECATION.md).

## [Unreleased]

### Added
- Package-scoped issue templates for consistent contributor guidance
- SDK deprecation policy and changelog section template (`sdk/DEPRECATION.md`)

### Changed

### Fixed

### Deprecated

### Removed

### Migration

### Dependencies

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
