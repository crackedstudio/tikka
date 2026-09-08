# On-Call Troubleshooting Guide

## Quick Reference

### Emergency Commands
```bash
# Check failed jobs
npm run oracle:rescue list-failed

# Check all job states
npm run oracle:rescue list-all

# View recent rescue operations
npm run oracle:rescue logs --limit 20

# Re-enqueue a job
npm run oracle:rescue re-enqueue <jobId> --operator <your-name> --reason "<reason>"

# Force submit (last resort)
npm run oracle:rescue force-submit <raffleId> <requestId> --operator <your-name> --reason "<reason>"
```

### Health Check Endpoints
```bash
# Oracle health
curl http://localhost:3003/health

# RPC status
curl http://localhost:3003/health/rpc

# Queue metrics
curl http://localhost:3003/health/queue
```

## Common Scenarios

### Scenario 1: Job Failed After All Retries

**Symptoms:**
- Alert: "Job failed after 5 attempts"
- Failed job visible in `list-failed`

**Diagnosis:**
```bash
# 1. Check failed jobs
npm run oracle:rescue list-failed

# 2. Check logs for error details
npm run oracle:rescue logs --raffle <raffleId>

# 3. Check RPC health
curl http://localhost:3003/health/rpc
```

**Resolution:**

If RPC is healthy and error is transient:
```bash
npm run oracle:rescue re-enqueue <jobId> \
  --operator <your-name> \
  --reason "Transient error, re-enqueuing for retry"
```

If RPC is down or persistent issue:
```bash
# Wait for RPC recovery, then force submit
npm run oracle:rescue force-submit <raffleId> <requestId> \
  --operator <your-name> \
  --reason "RPC recovered, manual submission after retries exhausted"
```

### Scenario 2: RPC Endpoint Down

**Symptoms:**
- Multiple jobs failing with "RPC timeout"
- RPC health check failing

**Diagnosis:**
```bash
# Check RPC status
curl http://localhost:3003/health/rpc

# Check if failover occurred
grep "RPC failover" /var/log/oracle/oracle.log
```

**Resolution:**

1. **Automatic Failover**: Oracle should automatically failover to backup RPC
2. **Manual Intervention**: If all RPCs down, wait for recovery
3. **After Recovery**: Re-enqueue failed jobs

```bash
# Get all failed jobs
npm run oracle:rescue list-failed

# Re-enqueue each job
npm run oracle:rescue re-enqueue <jobId> \
  --operator <your-name> \
  --reason "RPC recovered, re-enqueuing failed jobs"
```

### Scenario 3: High-Stakes Raffle Stuck

**Symptoms:**
- VIP raffle (>500 XLM) not processing
- Job in failed state
- Time-sensitive resolution needed

**Diagnosis:**
```bash
# Check job status
npm run oracle:rescue list-failed

# Verify raffle not already finalized
# (Check contract state via Stellar Explorer)
```

**Resolution:**

**URGENT - Force Submit:**
```bash
npm run oracle:rescue force-submit <raffleId> <requestId> \
  --operator <your-name> \
  --reason "High-stakes raffle stuck, urgent manual submission" \
  --prize <amount>
```

**Post-Resolution:**
1. Verify transaction on Stellar Explorer
2. Notify team in Slack/Discord
3. Document incident in rescue logs
4. Investigate root cause

### Scenario 4: Suspected Malicious Request

**Symptoms:**
- Invalid raffle ID
- Repeated failures for same request
- Suspicious request pattern

**Diagnosis:**
```bash
# Check job details
npm run oracle:rescue list-failed

# Check raffle exists in contract
# (Query contract via Stellar Explorer or RPC)

# Check for duplicate requests
npm run oracle:rescue logs --raffle <raffleId>
```

**Resolution:**

If confirmed malicious/invalid:
```bash
npm run oracle:rescue force-fail <jobId> \
  --operator <your-name> \
  --reason "Invalid raffle ID - suspected malicious request"
```

**Post-Resolution:**
1. Document in incident log
2. Notify security team
3. Consider adding validation rules
4. Monitor for similar patterns

### Scenario 5: Queue Backed Up

**Symptoms:**
- Many jobs in "waiting" state
- Processing lag increasing
- Delayed randomness submissions

**Diagnosis:**
```bash
# Check queue state
npm run oracle:rescue list-all

# Check queue metrics
curl http://localhost:3003/health/queue

# Check worker health
curl http://localhost:3003/health
```

**Resolution:**

1. **Check Worker Status**: Ensure workers are running
2. **Check Redis**: Verify Redis is accessible
3. **Check RPC**: Verify RPC endpoints healthy
4. **Scale Workers**: Consider adding more worker instances

```bash
# If workers stopped, restart service
systemctl restart oracle

# Monitor queue drain
watch -n 5 'npm run oracle:rescue list-all'
```

### Scenario 6: Duplicate Submissions

**Symptoms:**
- Multiple submissions for same raffle
- "Already finalized" errors

**Diagnosis:**
```bash
# Check rescue logs for raffle
npm run oracle:rescue logs --raffle <raffleId>

# Verify contract state
# (Check on Stellar Explorer)
```

**Resolution:**

**No action needed** - Idempotency prevents double-submission:
- Contract rejects duplicate submissions
- Jobs will fail gracefully
- No harm to raffle state

**Cleanup:**
```bash
# Remove duplicate failed jobs
npm run oracle:rescue force-fail <jobId> \
  --operator <your-name> \
  --reason "Duplicate submission, raffle already finalized"
```

### Scenario 7: Fee Estimation Issues

**Symptoms:**
- "Insufficient fee" errors
- Transactions failing simulation
- Fee bumping not working

**Diagnosis:**
```bash
# Check recent submissions
npm run oracle:rescue logs --limit 20

# Check network fee stats
curl http://localhost:3003/health/fees
```

**Resolution:**

1. **Wait for Network Congestion**: Fees may normalize
2. **Manual Submission with Higher Fee**: Force submit with explicit fee
3. **Update Fee Estimator**: Adjust fee estimation parameters

```bash
# Force submit (fee will be estimated)
npm run oracle:rescue force-submit <raffleId> <requestId> \
  --operator <your-name> \
  --reason "Manual submission with updated fee estimation"
```

## Escalation Matrix

### Level 1: Self-Service (On-Call Engineer)
- Re-enqueue failed jobs
- Monitor queue health
- Basic troubleshooting

### Level 2: Senior Engineer
- Force submit for high-stakes raffles
- RPC endpoint configuration
- Fee estimation tuning

### Level 3: Security Team
- Force fail malicious requests
- Incident response
- Security analysis

### Level 4: Core Team
- Contract issues
- Protocol changes
- Architecture decisions

## Monitoring Checklist

### Every 15 Minutes
- [ ] Check failed jobs count
- [ ] Check queue backlog
- [ ] Check RPC health

### Every Hour
- [ ] Review rescue logs
- [ ] Check fee estimation accuracy
- [ ] Verify worker health

### Every Shift
- [ ] Review all rescue operations
- [ ] Document incidents
- [ ] Update runbook if needed

## Incident Response Template

```markdown
## Incident Report

**Date/Time**: YYYY-MM-DD HH:MM UTC
**Operator**: [Your Name]
**Severity**: [Low/Medium/High/Critical]

### Summary
[Brief description of the issue]

### Timeline
- HH:MM - Issue detected
- HH:MM - Diagnosis completed
- HH:MM - Resolution applied
- HH:MM - Verified resolved

### Root Cause
[What caused the issue]

### Resolution
[What actions were taken]

### Commands Executed
```bash
[List all rescue commands used]
```

### Affected Raffles
- Raffle ID: [ID] - Status: [Resolved/Pending]

### Follow-up Actions
- [ ] Update monitoring alerts
- [ ] Document in runbook
- [ ] Notify team
- [ ] Schedule post-mortem (if critical)

### Lessons Learned
[What can be improved]
```

## Contact Information

### Emergency Contacts
- **On-Call Lead**: [Contact Info]
- **Security Team**: [Contact Info]
- **Core Team**: [Contact Info]

### Communication Channels
- **Slack**: #oracle-alerts
- **PagerDuty**: [Link]
- **Status Page**: [Link]

## Useful Links

- **Stellar Explorer (Testnet)**: https://stellar.expert/explorer/testnet
- **Stellar Explorer (Mainnet)**: https://stellar.expert/explorer/public
- **Soroban RPC Docs**: https://developers.stellar.org/docs/data/rpc
- **Oracle Dashboard**: [Link to internal dashboard]
- **Grafana Metrics**: [Link to Grafana]

## Post-Incident Checklist

After resolving an incident:

- [ ] Verify all affected raffles resolved
- [ ] Document rescue operations in logs
- [ ] Update incident report
- [ ] Notify stakeholders
- [ ] Review monitoring alerts
- [ ] Update runbook if needed
- [ ] Schedule post-mortem (if critical)
- [ ] Archive logs for compliance

## Tips for On-Call

1. **Always provide detailed reasons** in rescue commands
2. **Verify before force-submit** - check contract state first
3. **Document everything** - future you will thank you
4. **Don't panic** - idempotency prevents most disasters
5. **Escalate when unsure** - better safe than sorry
6. **Monitor after resolution** - ensure issue doesn't recur
7. **Keep team informed** - communicate in Slack
8. **Learn from incidents** - update this guide

## Common Error Messages

### "Job not found"
- Job may have been processed or removed
- Check job ID is correct
- Use `list-all` to see current jobs

### "Raffle already finalized"
- Another oracle or manual submission completed
- No action needed
- Clean up with force-fail if desired

### "Transaction submission failed"
- Check RPC health
- Verify oracle has funds
- Check network congestion
- Consider re-enqueue or force-submit

### "Missing configuration"
- Check environment variables
- Verify `.env` file loaded
- Restart service if needed

### "Insufficient fee"
- Network congestion
- Fee estimation too low
- Wait or force-submit with higher fee

## Quick Wins

### Clear All Failed Jobs (After Resolution)
```bash
# Get failed jobs
npm run oracle:rescue list-failed

# For each job, either re-enqueue or force-fail
# Re-enqueue if valid
npm run oracle:rescue re-enqueue <jobId> --operator <name> --reason "Clearing backlog"

# Force-fail if invalid
npm run oracle:rescue force-fail <jobId> --operator <name> --reason "Invalid request"
```

### Bulk Re-enqueue Script
```bash
#!/bin/bash
# Save as scripts/bulk-reenqueue.sh

OPERATOR="$1"
REASON="$2"

if [ -z "$OPERATOR" ] || [ -z "$REASON" ]; then
  echo "Usage: ./bulk-reenqueue.sh <operator> <reason>"
  exit 1
fi

# Get failed job IDs
JOBS=$(npm run oracle:rescue list-failed | grep "Job ID:" | awk '{print $3}')

for JOB_ID in $JOBS; do
  echo "Re-enqueuing job $JOB_ID..."
  npm run oracle:rescue re-enqueue "$JOB_ID" --operator "$OPERATOR" --reason "$REASON"
  sleep 1
done

echo "Done!"
```

## Remember

> "The best rescue is the one you don't need to perform."
> - Monitor proactively
> - Fix root causes
> - Improve automation
> - Document everything
