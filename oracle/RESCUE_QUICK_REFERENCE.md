# Oracle Rescue - Quick Reference

## Commands

### List Jobs
```bash
# List failed jobs
npm run oracle:rescue list-failed

# List all jobs by state
npm run oracle:rescue list-all
```

### Re-enqueue Failed Job
```bash
npm run oracle:rescue re-enqueue <jobId> \
  --operator <your-name> \
  --reason "<reason>"
```

### Force Submit Randomness
```bash
npm run oracle:rescue force-submit <raffleId> <requestId> \
  --operator <your-name> \
  --reason "<reason>" \
  --prize <amount>  # optional
```

### Force Fail Job
```bash
npm run oracle:rescue force-fail <jobId> \
  --operator <your-name> \
  --reason "<reason>"
```

### View Logs
```bash
# All logs (last 100)
npm run oracle:rescue logs

# Specific raffle
npm run oracle:rescue logs --raffle <raffleId>

# Custom limit
npm run oracle:rescue logs --limit 50
```

## API Endpoints

### Re-enqueue
```bash
POST /rescue/re-enqueue
{
  "jobId": "12345",
  "operator": "alice",
  "reason": "RPC timeout, retrying"
}
```

### Force Submit
```bash
POST /rescue/force-submit
{
  "raffleId": 42,
  "requestId": "req_abc123",
  "operator": "bob",
  "reason": "All retries exhausted",
  "prizeAmount": 1000  // optional
}
```

### Force Fail
```bash
POST /rescue/force-fail
{
  "jobId": "12345",
  "operator": "alice",
  "reason": "Invalid raffle ID"
}
```

### List Failed Jobs
```bash
GET /rescue/failed-jobs
```

### List All Jobs
```bash
GET /rescue/jobs
```

### View Logs
```bash
GET /rescue/logs?limit=100
GET /rescue/logs/:raffleId
```

## Common Scenarios

### Job Failed After Retries
```bash
# 1. Check failed jobs
npm run oracle:rescue list-failed

# 2. Re-enqueue
npm run oracle:rescue re-enqueue <jobId> \
  --operator <name> \
  --reason "Transient error, retrying"
```

### High-Stakes Raffle Stuck
```bash
# Force submit immediately
npm run oracle:rescue force-submit <raffleId> <requestId> \
  --operator <name> \
  --reason "High-stakes raffle urgent submission" \
  --prize <amount>
```

### Malicious Request
```bash
# Force fail to remove from queue
npm run oracle:rescue force-fail <jobId> \
  --operator <name> \
  --reason "Invalid raffle ID - malicious request"
```

### Check Rescue History
```bash
# View all rescue operations
npm run oracle:rescue logs --limit 50

# View operations for specific raffle
npm run oracle:rescue logs --raffle 42
```

## Audit Trail

All rescue operations are logged with:
- Timestamp
- Action (RE_ENQUEUE, FORCE_SUBMIT, FORCE_FAIL)
- Raffle ID and Request ID
- Operator name
- Reason
- Result (SUCCESS/FAILURE)
- Additional details (tx hash, error messages, etc.)

## Safety Features

- **Idempotency**: Force submit checks if raffle already finalized
- **Validation**: All operations validate inputs
- **Audit Logging**: Complete trail of all manual interventions
- **Operator Tracking**: All operations require operator identification
- **Reason Required**: All operations require documented reason

## Help

```bash
npm run oracle:rescue help
```

## Documentation

- **Full Guide**: `RESCUE_GUIDE.md`
- **On-Call Guide**: `ON_CALL_TROUBLESHOOTING.md`
- **Implementation**: `RESCUE_IMPLEMENTATION.md`
- **Module README**: `src/rescue/README.md`
