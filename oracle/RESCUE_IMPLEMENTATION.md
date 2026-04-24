# Oracle Rescue Tool - Implementation Summary

## Overview

Implemented a comprehensive manual intervention system for failed oracle jobs, providing both CLI and API interfaces for operators to rescue stuck or failed randomness requests.

## Components Implemented

### 1. RescueService (`src/rescue/rescue.service.ts`)

Core service providing rescue operations with full audit logging.

**Key Methods:**
- `reEnqueueJob(jobId, operator, reason)` - Re-add failed job to queue with new retry attempts
- `forceSubmit(raffleId, requestId, operator, reason, prizeAmount?)` - Manually compute and submit randomness
- `forceFail(jobId, operator, reason)` - Mark job as invalid/malicious and remove from queue
- `getFailedJobs()` - List all jobs in failed state
- `getAllJobs()` - Get jobs by state (waiting, active, completed, failed, delayed)
- `getRescueLogs(limit)` - Retrieve audit trail of rescue operations
- `getRescueLogsByRaffle(raffleId)` - Filter logs by specific raffle

**Features:**
- Automatic VRF/PRNG method selection based on prize amount
- Idempotency checks (won't double-submit)
- Comprehensive error handling
- In-memory audit log (last 1000 entries)
- Prize amount auto-fetch from contract if not provided

### 2. RescueController (`src/rescue/rescue.controller.ts`)

REST API endpoints for programmatic access.

**Endpoints:**
- `POST /rescue/re-enqueue` - Re-enqueue a failed job
- `POST /rescue/force-submit` - Force submit randomness
- `POST /rescue/force-fail` - Force fail a job
- `GET /rescue/failed-jobs` - List failed jobs
- `GET /rescue/jobs` - List all jobs by state
- `GET /rescue/logs?limit=N` - View rescue audit logs
- `GET /rescue/logs/:raffleId` - View logs for specific raffle

### 3. Rescue CLI (`src/rescue/rescue.cli.ts`)

Command-line interface for operator use.

**Commands:**
```bash
# Re-enqueue failed job
npm run oracle:rescue re-enqueue <jobId> --operator <name> --reason <reason>

# Force submit randomness
npm run oracle:rescue force-submit <raffleId> <requestId> --operator <name> --reason <reason> [--prize <amount>]

# Force fail job
npm run oracle:rescue force-fail <jobId> --operator <name> --reason <reason>

# List failed jobs
npm run oracle:rescue list-failed

# List all jobs
npm run oracle:rescue list-all

# View rescue logs
npm run oracle:rescue logs [--raffle <raffleId>] [--limit <n>]
```

**Features:**
- User-friendly command-line interface
- Comprehensive help text
- Clear success/failure indicators
- Detailed output formatting
- Error handling with exit codes

### 4. RescueModule (`src/rescue/rescue.module.ts`)

NestJS module integrating rescue functionality.

**Dependencies:**
- QueueModule (Bull queue access)
- HealthModule (health tracking)
- ContractService (raffle state verification)
- VrfService & PrngService (randomness computation)
- TxSubmitterService (transaction submission)

### 5. Unit Tests (`src/rescue/rescue.service.spec.ts`)

Comprehensive test coverage for RescueService.

**Test Coverage:**
- ✅ Re-enqueue successful job
- ✅ Re-enqueue with job not found
- ✅ Re-enqueue with already finalized raffle
- ✅ Force submit low-stakes raffle (PRNG)
- ✅ Force submit high-stakes raffle (VRF)
- ✅ Force submit with auto-fetch prize amount
- ✅ Force submit with already finalized raffle
- ✅ Force submit with transaction failure
- ✅ Force fail successful
- ✅ Force fail with job not found
- ✅ Get failed jobs list
- ✅ Get rescue logs
- ✅ Filter logs by raffle ID

## Documentation

### 1. RESCUE_GUIDE.md

Comprehensive user guide covering:
- Architecture overview
- Usage examples for all commands
- API usage with curl examples
- Decision tree for choosing rescue action
- Audit trail explanation
- Best practices
- Troubleshooting common issues
- Security considerations
- Integration with monitoring

### 2. ON_CALL_TROUBLESHOOTING.md

On-call operator handbook covering:
- Quick reference commands
- Common failure scenarios with resolutions
- Escalation matrix
- Monitoring checklist
- Incident response template
- Contact information
- Post-incident checklist
- Tips for on-call engineers
- Bulk operation scripts

## Integration

### App Module
Updated `src/app.module.ts` to import RescueModule, making rescue endpoints available when oracle service starts.

### Package.json
Added `oracle:rescue` script for CLI access:
```json
"oracle:rescue": "ts-node src/rescue/rescue.cli.ts"
```

## Audit Trail

All rescue operations are logged with:
- **Timestamp** - When operation occurred
- **Action** - RE_ENQUEUE, FORCE_SUBMIT, or FORCE_FAIL
- **Raffle ID** - Affected raffle
- **Request ID** - Randomness request identifier
- **Job ID** - Queue job identifier (if applicable)
- **Operator** - Name/ID of person performing rescue
- **Reason** - Explanation for manual intervention
- **Result** - SUCCESS or FAILURE
- **Details** - Additional context (tx hash, errors, etc.)

Logs are:
- Stored in memory (last 1000 entries)
- Accessible via CLI and API
- Filterable by raffle ID
- Used for compliance and troubleshooting

## Security Features

1. **Operator Identification** - All operations require operator name
2. **Reason Logging** - All operations require explanation
3. **Audit Trail** - Complete history of manual interventions
4. **Idempotency** - Safe to retry operations
5. **Validation** - Checks raffle state before submission
6. **Access Control Ready** - API endpoints can be protected with auth middleware

## Usage Examples

### Scenario 1: RPC Timeout
```bash
# Check failed jobs
npm run oracle:rescue list-failed

# Re-enqueue the job
npm run oracle:rescue re-enqueue 12345 \
  --operator alice \
  --reason "RPC timeout, retrying with backup endpoint"
```

### Scenario 2: All Retries Exhausted
```bash
# Force submit manually
npm run oracle:rescue force-submit 42 req_abc123 \
  --operator bob \
  --reason "All retries exhausted, manual submission required"
```

### Scenario 3: Invalid Request
```bash
# Mark as failed
npm run oracle:rescue force-fail 12345 \
  --operator alice \
  --reason "Invalid raffle ID - suspected malicious request"
```

### Scenario 4: Audit Review
```bash
# View recent rescue operations
npm run oracle:rescue logs --limit 50

# View operations for specific raffle
npm run oracle:rescue logs --raffle 42
```

## API Examples

### Re-enqueue via API
```bash
curl -X POST http://localhost:3003/rescue/re-enqueue \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "12345",
    "operator": "alice",
    "reason": "RPC timeout, retrying"
  }'
```

### Force Submit via API
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

## Testing

Run unit tests:
```bash
cd oracle
npm test src/rescue/rescue.service.spec.ts
```

## Future Enhancements

1. **Persistent Audit Logs** - Store logs in database for long-term retention
2. **Access Control** - Add authentication/authorization to API endpoints
3. **Monitoring Integration** - Send metrics to Prometheus/Grafana
4. **Alerting** - Trigger alerts on high rescue frequency
5. **Bulk Operations** - Add commands for bulk re-enqueue/force-fail
6. **Web Dashboard** - Build UI for rescue operations
7. **Approval Workflow** - Require approval for high-stakes force-submit
8. **Automated Recovery** - Auto-retry certain failure patterns

## Files Created

```
oracle/
├── src/
│   └── rescue/
│       ├── rescue.module.ts          # NestJS module
│       ├── rescue.service.ts         # Core service logic
│       ├── rescue.service.spec.ts    # Unit tests
│       ├── rescue.controller.ts      # REST API endpoints
│       └── rescue.cli.ts             # CLI interface
├── RESCUE_GUIDE.md                   # User guide
├── ON_CALL_TROUBLESHOOTING.md        # On-call handbook
└── RESCUE_IMPLEMENTATION.md          # This file
```

## Configuration

No additional environment variables required. Uses existing oracle configuration:
- `REDIS_HOST` / `REDIS_PORT` - Queue access
- `SOROBAN_RPC_URL` - Contract interaction
- `RAFFLE_CONTRACT_ID` - Contract address
- `ORACLE_SECRET_KEY` - Transaction signing

## Deployment

1. **Build**: `npm run build`
2. **Start**: Service automatically includes rescue endpoints
3. **CLI Access**: `npm run oracle:rescue <command>`
4. **API Access**: `http://localhost:3003/rescue/*`

## Monitoring

Recommended metrics to track:
- `rescue_operations_total{action, result}` - Count of rescue operations
- `rescue_operations_by_raffle{raffleId}` - Operations per raffle
- `rescue_operations_by_operator{operator}` - Operations per operator
- `failed_jobs_count` - Current failed jobs in queue
- `rescue_force_submit_duration_seconds` - Time to force submit

## Compliance

Audit logs support:
- **Operational Compliance** - Track all manual interventions
- **Security Audits** - Identify suspicious patterns
- **Incident Response** - Post-mortem analysis
- **Performance Analysis** - Identify recurring issues

## Success Criteria

✅ CLI tool for manual job rescue  
✅ API endpoints for programmatic access  
✅ Re-enqueue failed jobs  
✅ Force submit randomness manually  
✅ Force fail invalid jobs  
✅ List failed jobs  
✅ Comprehensive audit logging  
✅ Unit test coverage  
✅ User documentation  
✅ On-call troubleshooting guide  
✅ Integration with existing oracle services  

## Conclusion

The Oracle Rescue Tool provides a robust manual intervention system for handling failed oracle jobs. With both CLI and API interfaces, comprehensive audit logging, and detailed documentation, operators can confidently rescue stuck jobs while maintaining full accountability and traceability.
