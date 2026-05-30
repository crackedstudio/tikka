# Backend OPERATIONAL stub

Owner: @backend-team

Required links:
- Dashboards:
  - Service health: <link>
  - Latency and errors: <link>

Alerts:
- High 5xx rate (Pager: @backend-team)
- Latency P95 above threshold

Runbook:
- Immediate mitigation: scale up, enable circuit breaker, rollback release.

Rollback instructions:
- How to roll back deployments, revert migrations, and verify traffic health.

Verification:
- Integration smoke tests, critical endpoints monitored.

Current gaps:
- Tracing coverage incomplete
