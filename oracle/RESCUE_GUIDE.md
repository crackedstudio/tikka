# Oracle Rescue Guide

## Overview

The Oracle Rescue tool provides manual intervention capabilities for failed oracle jobs. When a job exhausts all automatic retries, operators can use this tool to re-enqueue jobs, force-submit randomness, or mark jobs as failed.

## Architecture

```
Failed Job Detection
        ↓
Manual Intervention Required
        ↓
    ┌───┴────────────────────────┐
    │ 1. Assess situation        │
    │ 2. Choose rescue action    │
    │ 3. Execute via CLI/API     │
    │ 4. Verify result           │
    │ 5. Log for audit           │
    └────────────────────────────┘
```

## Components

### RescueService
Core service providing rescue operations:
- `reEnqueueJob()` - Re-add failed job to queue
- `forceSubmit()` - Manually compute and submit randomness
- `forceFail()` - Mark job as invalid/malicious
- `getFailedJobs()` - List failed jobs
- `getRescueLogs()` - Audit trail of rescue operations

### RescueController
REST API endpoints for programmatic access:
- `POST /rescue/re-enqueue` - Re-enqueue a job
- `POST /rescue/force-submit` - Force submit randomness
- `POST /rescue/force-fail` - Force fail a job
- `GET /rescue/failed-jobs` - List failed jobs
- `GET /rescue/jobs` - List all jobs by state
- `GET /rescue/logs` - View rescue audit logs
- `GET /rescue/logs/:raffleId` - View logs for specific raffle

### Rescue CLI
Command-line interface for operator use:
```bash
npm run oracle:rescue <command> [arguments] [options]
```

## Usage

### 1. Re-enqueue a Failed Job

When a job fails due to temporary issues (RPC timeout, network error), re-enqueue it:

```bash
npm run oracle:rescue re-enqueue <jobId> --operator <name> --reason <reason>
```

**Example:**
```bash
npm run oracle:rescue re-enqueue 12345 --operator alice --reason "RPC timeout, retrying with backup endpoint"
```

**When to use:**
- Temporary RPC failures
- Network connectivity issues
- Rate limiting errors
- Transient contract errors

### 2. Force Submit Randomness

When all retries are exhausted but the raffle is valid, manually compute and submit:

```bash
npm run oracle:rescue force-submit <raffleId> <requestId> --operator <name> --reason <reason> [--prize <amount>]
```

**Example:**
```bash
# Let service fetch prize amount from contract
npm run oracle:rescue force-submit 42 req_abc123 --operator bob --reason "All retries exhausted, manual submission"

# Specify prize amount explicitly
npm run oracle:rescue force-submit 42 req_abc123 --operator bob --reason "Manual intervention" --prize 1000
```

**When to use:**
- All automatic retries failed
- Job stuck in failed state
- Urgent raffle needs resolution
- Contract is accessible but job won't process

**Process:**
1. Verifies raffle not already finalized
2. Fetches prize amount (if not provided)
3. Determines VRF/PRNG method based on prize
4. Computes randomness
5. Submits to contract
6. Logs operation for audit

### 3. Force Fail a Job

When a job is invalid or malicious, mark it as failed and remove from queue:

```bash
npm run oracle:rescue force-fail <jobId> --operator <name> --reason <reason>
```

**Example:**
```bash
npm run oracle:rescue force-fail 12345 --operator alice --reason "Invalid raffle ID - suspected malicious request"
```

**When to use:**
- Invalid raffle ID
- Malicious request detected
- Duplicate/spam requests
- Contract state inconsistency
- Job should never be processed

### 4. List Failed Jobs

View all jobs currently in failed state:

```bash
npm run oracle:rescue list-failed
```

**Output:**
```
Found 3 failed job(s):

Job ID: 12345
  Raffle ID: 42
  Request ID: req_abc123
  Attempts: 5
  Failed Reason: RPC timeout after 5 retries
  Timestamp: 2024-01-15T10:30:00.000Z

Job ID: 12346
  Raffle ID: 43
  Request ID: req_def456
  Attempts: 5
  Failed Reason: Contract simulation failed
  Timestamp: 2024-01-15T11:00:00.000Z
```

### 5. List All Jobs

View jobs in all states (waiting, active, completed, failed, delayed):

```bash
npm run oracle:rescue list-all
```

**Output:**
```
Waiting: 5
Active: 2
Completed: 1234
Failed: 3
Delayed: 1

Failed Jobs:
  12345 - Raffle 42 - RPC timeout after 5 retries
  12346 - Raffle 43 - Contract simulation failed
  12347 - Raffle 44 - Unknown error
```

### 6. View Rescue Logs

View audit trail of all rescue operations:

```bash
# View last 100 logs (default)
npm run oracle:rescue logs

# View last 50 logs
npm run oracle:rescue logs --limit 50

# View logs for specific raffle
npm run oracle:rescue logs --raffle 42
```

**Output:**
```
Found 5 rescue operation(s):

[2024-01-15T10:35:00.000Z] FORCE_SUBMIT - SUCCESS
  Raffle ID: 42
  Request ID: req_abc123
  Operator: bob
  Reason: All retries exhausted, manual submission
  Details: {"txHash":"abc123...","ledger":12345,"method":"VRF","prizeAmount":1000}

[2024-01-15T09:20:00.000Z] RE_ENQUEUE - SUCCESS
  Raffle ID: 41
  Request ID: req_xyz789
  Operator: alice
  Reason: RPC timeout, retrying
  Job ID: 12348
  Details: {"originalJobId":"12344","newJobId":"12348"}
```

## API Usage

For programmatic access, use the REST API:

### Re-enqueue Job
```bash
curl -X POST http://localhost:3003/rescue/re-enqueue \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "12345",
    "operator": "alice",
    "reason": "RPC timeout, retrying"
  }'
```

### Force Submit
```bash
curl -X POST http://localhost:3003/rescue/force-submit \
  -H "Content-Type: application/json" \
  -d '{
    "raffleId": 42,
    "requestId": "req_abc123",
    "operator": "bob",
    "reason": "Manual intervention",
    "prizeAmount": 1000
  }'
```

### Force Fail
```bash
curl -X POST http://localhost:3003/rescue/force-fail \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "12345",
    "operator": "alice",
    "reason": "Invalid raffle ID"
  }'
```

### Get Failed Jobs
```bash
curl http://localhost:3003/rescue/failed-jobs
```

### Get Rescue Logs
```bash
# All logs
curl http://localhost:3003/rescue/logs?limit=50

# Logs for specific raffle
curl http://localhost:3003/rescue/logs/42
```

## Decision Tree

```
Job Failed After All Retries
        ↓
Is the raffle valid?
    ├─ No → Force Fail
    │       (Invalid/malicious request)
    │
    └─ Yes → Is it a temporary issue?
            ├─ Yes → Re-enqueue
            │        (RPC timeout, network error)
            │
            └─ No → Force Submit
                     (Persistent issue, urgent resolution)
```

## Audit Trail

All rescue operations are logged with:
- Timestamp
- Action type (RE_ENQUEUE, FORCE_SUBMIT, FORCE_FAIL)
- Raffle ID and Request ID
- Operator name
- Reason for intervention
- Result (SUCCESS/FAILURE)
- Additional details (tx hash, job IDs, errors)

Logs are:
- Stored in memory (last 1000 entries)
- Accessible via CLI and API
- Filterable by raffle ID
- Used for compliance and troubleshooting

## Best Practices

### 1. Always Provide Clear Reasons
```bash
# Good
--reason "RPC endpoint timeout after 5 retries, switching to backup"

# Bad
--reason "retry"
```

### 2. Verify Before Force Submit
```bash
# Check failed jobs first
npm run oracle:rescue list-failed

# Verify raffle state in contract
# Then force submit
npm run oracle:rescue force-submit ...
```

### 3. Use Force Fail Sparingly
Only use force-fail for truly invalid requests:
- Malicious activity
- Invalid raffle IDs
- Duplicate spam requests

### 4. Monitor Rescue Logs
Regularly review logs to identify patterns:
```bash
npm run oracle:rescue logs --limit 100
```

### 5. Document Operator Actions
Include your name and detailed reason:
```bash
--operator "alice@example.com" --reason "Detailed explanation of issue and resolution"
```

## Troubleshooting

### Job Not Found
```
Error: Job 12345 not found
```
- Job may have been removed from queue
- Check job ID is correct
- Use `list-all` to see available jobs

### Raffle Already Finalized
```
Failed: Raffle 42 already finalized
```
- Another oracle or manual submission already processed
- Check contract state
- No action needed

### Transaction Submission Failed
```
Failed to submit: Transaction submission failed
```
- Check RPC endpoint health
- Verify oracle keypair has funds
- Check contract state
- Review transaction logs

### Missing Configuration
```
Missing configuration for TxSubmitter
```
- Ensure `RAFFLE_CONTRACT_ID` is set
- Ensure `ORACLE_SECRET_KEY` is set
- Check `.env` file

## Security Considerations

1. **Access Control**: Restrict CLI/API access to authorized operators only
2. **Audit Logging**: All operations are logged with operator identity
3. **Validation**: Service validates raffle state before submission
4. **Idempotency**: Safe to retry operations (won't double-submit)
5. **Rate Limiting**: Consider adding rate limits to API endpoints

## Integration with Monitoring

Rescue operations should trigger alerts:
- High frequency of manual interventions
- Repeated failures for same raffle
- Force-fail operations (potential security issue)

Example monitoring queries:
```javascript
// Alert if >5 rescues in 1 hour
rescueLogs.filter(log => 
  log.timestamp > Date.now() - 3600000
).length > 5

// Alert on force-fail operations
rescueLogs.filter(log => 
  log.action === 'FORCE_FAIL'
)
```

## Next Steps

1. Set up monitoring alerts for rescue operations
2. Create runbook for common failure scenarios
3. Implement access control for API endpoints
4. Add persistent storage for audit logs
5. Create dashboard for rescue operations
