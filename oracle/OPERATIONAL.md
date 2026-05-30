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
- Failover to backup oracle, key revocation/rotation steps.

Rollback instructions:
- Steps to revert to a previous data feed source and validate consumers.

Verification:
- End-to-end validation of oracle feeds in staging.

Current gaps:
- Key rotation docs incomplete
