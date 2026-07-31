# SDK OPERATIONAL stub

Owner: @sdk-team

Required links:
- Dashboards: N/A (library) — monitor downstream errors: <link>
- Deprecation / versioning policy: [DEPRECATION.md](./DEPRECATION.md)
- Release procedures: [docs/RELEASE.md](../docs/RELEASE.md)

Alerts:
- Breaking API contract detected in CI (Pager: @sdk-team)

Runbook:
- Deprecate public API per [DEPRECATION.md](./DEPRECATION.md) (JSDoc `@deprecated` + CHANGELOG), then roll back to a previous published package if a bad release ships.

Rollback instructions:
- Re-publish previous SDK artifact and notify integrators.
- Document the rollback under `### Fixed` / release notes in `CHANGELOG.md`.

Verification:
- Contract tests pass against staging backend.
- Changelog includes required `### Deprecated` / `### Removed` entries when public API changes.

Current gaps:
- Some contract tests missing
