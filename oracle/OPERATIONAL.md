# Oracle OPERATIONAL stub

Owner: @oracle-team

Required links:
- Dashboards:
  - Data freshness: <link>
  - Validation errors: <link>

Alerts:
- Data staleness (Pager: @oracle-team)
- Signature verification failures

Runbook:
- [On-Call Troubleshooting](./docs/runbooks/on-call-troubleshooting.md)
- [Rescue Runbook](./docs/runbooks/rescue-runbook.md)
- [Manual Test Guide](./docs/runbooks/manual-test-guide.md)
- [Push Instructions](./docs/runbooks/push-instructions.md)
- [E2E Test Guide](./docs/runbooks/e2e-test-guide.md)
- Failover to backup oracle, key revocation/rotation steps.

Rollback instructions:
- Steps to revert to a previous data feed source and validate consumers.

Verification:
- End-to-end validation of oracle feeds in staging.

Current gaps:
- Key rotation docs incomplete
