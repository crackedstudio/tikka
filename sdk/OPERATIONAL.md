# SDK OPERATIONAL stub

Owner: @sdk-team

Required links:
- Dashboards: N/A (library) — monitor downstream errors: <link>

Alerts:
- Breaking API contract detected in CI (Pager: @sdk-team)

Runbook:
- Deprecation policy, rollback to previous published packages.

Rollback instructions:
- Re-publish previous SDK artifact and notify integrators.

Verification:
- Contract tests pass against staging backend.

Current gaps:
- Some contract tests missing
