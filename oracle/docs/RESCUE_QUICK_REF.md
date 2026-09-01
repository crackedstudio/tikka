# Oracle Rescue - Quick Reference Card

## Emergency Commands

```bash
# Check what's broken
npm run oracle:rescue list-failed

# Re-enqueue a job (temporary failure)
npm run oracle:rescue re-enqueue <jobId> --operator <name> --reason "<why>"

# Force submit (all retries failed)
npm run oracle:rescue force-submit <raffleId> <requestId> --operator <name> --reason "<why>"

# Force fail (invalid/malicious)
npm run oracle:rescue force-fail <jobId> --operator <name> --reason "<why>"

# View recent activity
npm run oracle:rescue logs --limit 20
```

## Decision Tree

```
Job Failed?
  ├─ Temporary issue (RPC timeout, network) → RE-ENQUEUE
  ├─ Persistent issue (all retries failed)  → FORCE SUBMIT
  └─ Invalid request (malicious, bad data)  → FORCE FAIL
```

## Common Scenarios

### RPC Timeout
```bash
npm run oracle:rescue re-enqueue 12345 \
  --operator alice \
  --reason "RPC timeout, retrying"
```

### All Retries Failed
```bash
npm run oracle:rescue force-submit 42 req_abc123 \
  --operator bob \
  --reason "All retries exhausted"
```

### Invalid Request
```bash
npm run oracle:rescue force-fail 12345 \
  --operator alice \
  --reason "Invalid raffle ID"
```

## API Endpoints

```bash
# Re-enqueue
POST /rescue/re-enqueue
Body: {"jobId": "12345", "operator": "alice", "reason": "..."}

# Force submit
POST /rescue/force-submit
Body: {"raffleId": 42, "requestId": "req_123", "operator": "bob", "reason": "..."}

# Force fail
POST /rescue/force-fail
Body: {"jobId": "12345", "operator": "alice", "reason": "..."}

# List failed
GET /rescue/failed-jobs

# View logs
GET /rescue/logs?limit=50
GET /rescue/logs/42  # For raffle 42
```

## Health Checks

```bash
curl http://localhost:3003/health
curl http://localhost:3003/health/rpc
curl http://localhost:3003/health/queue
```

## Remember

- Always provide operator name
- Always provide clear reason
- Check raffle state before force-submit
- Review logs after operations
- Document in incident report

## Help

```bash
npm run oracle:rescue help
```

Full docs: `RESCUE_GUIDE.md` and `ON_CALL_TROUBLESHOOTING.md`
