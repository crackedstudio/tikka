# Client OPERATIONAL stub

Owner: @client-team

Required links:
- Dashboards:
  - Errors & crash rate: <link>
  - Release adoption: <link>

Alerts:
- Error spike > X% (Pager: @client-team)
- Release regression (automated test failures)

Runbook:
- Quick mitigation steps
  1. Revert to last-known-good release artifact
  2. Notify QA and begin postmortem

Rollback instructions:
- How to roll back client versions, artifact locations, and verification steps.

Verification:
- Smoke: basic flows work (login, key API endpoints) after deploy.

Current gaps:
- Rollback playbook: TODO
