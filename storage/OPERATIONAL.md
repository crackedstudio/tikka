# Storage OPERATIONAL stub

Owner: @storage-team

Required links:
- Dashboards:
  - Object errors (4xx/5xx): <link>
  - Storage cost & usage: <link>

Alerts:
- Bucket permission errors (Pager: @storage-team)
- Sudden spike in 4xx/5xx

Runbook:
- Recover deleted objects (versioning) and restore from backup.

Rollback instructions:
- How to revert lifecycle/policy changes and validate access.

Verification:
- Lifecycle policy tests and permission audits.

Current gaps:
- Standardized lifecycle policy missing
