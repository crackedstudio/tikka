# Oracle Rescue Feature - Implementation Complete ✅

## Overview

The Oracle Rescue feature is **fully implemented and ready for use**. It provides CLI and API tools for manual intervention when oracle jobs fail after all retries.

## What's Implemented

### 1. CLI Tool ✅
Command: `npm run oracle:rescue {command}`

Available commands:
- `re-enqueue <jobId>` - Re-enqueue a failed job
- `force-submit <raffleId> <requestId>` - Manually compute and submit randomness
- `force-fail <jobId>` - Mark job as failed (for invalid/malicious requests)
- `list-failed` - List all failed jobs
- `list-all` - List all jobs by state
- `logs` - View rescue operation audit logs

### 2. REST API ✅
Endpoints available at `/rescue/*`:
- `POST /rescue/re-enqueue` - Re-enqueue failed job
- `POST /rescue/force-submit` - Force submit randomness
- `POST /rescue/force-fail` - Force fail job
- `GET /rescue/failed-jobs` - List failed jobs
- `GET /rescue/jobs` - List all jobs
- `GET /rescue/logs` - View audit logs
- `GET /rescue/logs/:raffleId` - View logs for specific raffle

### 3. Manual Submission Tool ✅
The `force-submit` command:
- Takes `raffleId` and `requestId`
- Automatically determines method (VRF/PRNG) based on prize amount
- Computes randomness using appropriate service
- Submits to contract via TxSubmitter
- Logs all operations for audit trail

### 4. Audit Logging ✅
All rescue operations are logged with:
- Timestamp
- Action type (RE_ENQUEUE, FORCE_SUBMIT, FORCE_FAIL)
- Raffle ID and Request ID
- Operator name (who performed the action)
- Reason (why the action was taken)
- Result (SUCCESS/FAILURE)
- Additional details (tx hash, error messages, etc.)

### 5. Force Fail Capability ✅
The `force-fail` command:
- Removes job from queue
- Logs the operation
- Used for invalid or malicious requests
- Requires operator identification and reason

## File Structure

```
oracle/
├── src/rescue/
│   ├── rescue.module.ts          # NestJS module
│   ├── rescue.service.ts         # Core business logic
│   ├── rescue.controller.ts      # REST API endpoints
│   ├── rescue.cli.ts             # CLI interface
│   ├── rescue.service.spec.ts    # Unit tests
│   └── README.md                 # Module documentation
├── RESCUE_QUICK_REFERENCE.md     # Quick reference guide
├── ON_CALL_TROUBLESHOOTING.md    # On-call handbook
├── RESCUE_GUIDE.md               # Comprehensive user guide
└── package.json                  # CLI command configured
```

## Usage Examples

### Re-enqueue a Failed Job
```bash
npm run oracle:rescue re-enqueue 12345 \
  --operator alice \
  --reason "RPC timeout, retrying"
```

### Force Submit Randomness
```bash
npm run oracle:rescue force-submit 42 req_abc123 \
  --operator bob \
  --reason "All retries exhausted" \
  --prize 1000
```

### Force Fail Invalid Request
```bash
npm run oracle:rescue force-fail 12345 \
  --operator alice \
  --reason "Invalid raffle ID - malicious request"
```

### List Failed Jobs
```bash
npm run oracle:rescue list-failed
```

### View Rescue Logs
```bash
# All logs
npm run oracle:rescue logs

# Specific raffle
npm run oracle:rescue logs --raffle 42

# Custom limit
npm run oracle:rescue logs --limit 50
```

## API Usage Examples

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
    "reason": "All retries exhausted",
    "prizeAmount": 1000
  }'
```

### List Failed Jobs via API
```bash
curl http://localhost:3003/rescue/failed-jobs
```

## Safety Features

1. **Idempotency**: Force submit checks if raffle already finalized
2. **Validation**: All operations validate inputs before execution
3. **Audit Trail**: Complete logging of all manual interventions
4. **Operator Tracking**: All operations require operator identification
5. **Reason Required**: All operations require documented reason
6. **Error Handling**: Graceful failure with detailed error messages

## Integration

The rescue module is fully integrated:
- ✅ Imported in `app.module.ts`
- ✅ CLI command configured in `package.json`
- ✅ REST endpoints exposed via controller
- ✅ Dependencies injected (Queue, Contract, VRF, PRNG, TxSubmitter)
- ✅ Unit tests included

## Documentation

Comprehensive documentation available:
- **Quick Reference**: `oracle/RESCUE_QUICK_REFERENCE.md`
- **On-Call Guide**: `oracle/ON_CALL_TROUBLESHOOTING.md`
- **Module README**: `oracle/src/rescue/README.md`
- **Implementation Details**: `oracle/RESCUE_IMPLEMENTATION.md`

## Testing

Unit tests available at:
```bash
npm test src/rescue/rescue.service.spec.ts
```

Integration tests available at:
```bash
npm test src/rescue/rescue.integration.test.ts
```

## Next Steps

The feature is complete and ready for use. To start using it:

1. **Development**: Run `npm run oracle:rescue help` to see all commands
2. **Production**: Ensure proper access controls for rescue endpoints
3. **Monitoring**: Set up alerts for failed jobs
4. **Training**: Review the on-call troubleshooting guide

## Common Scenarios

### Scenario 1: Job Failed After All Retries
```bash
# Check failed jobs
npm run oracle:rescue list-failed

# Re-enqueue the job
npm run oracle:rescue re-enqueue <jobId> \
  --operator <name> \
  --reason "Transient error, retrying"
```

### Scenario 2: High-Stakes Raffle Stuck
```bash
# Force submit immediately
npm run oracle:rescue force-submit <raffleId> <requestId> \
  --operator <name> \
  --reason "High-stakes raffle urgent submission"
```

### Scenario 3: Malicious Request Detected
```bash
# Force fail to remove from queue
npm run oracle:rescue force-fail <jobId> \
  --operator <name> \
  --reason "Invalid raffle ID - malicious request"
```

## Architecture

```
RescueController (REST API)
        ↓
RescueService (Business Logic)
        ↓
    ┌───┴────────────────┐
    │                    │
Queue (Redis)    Contract Service
                         │
                 Randomness Services (VRF/PRNG)
                         │
                 TxSubmitter Service
```

## Contributor Guide

To extend the rescue functionality:

1. **Add new command**: Update `rescue.cli.ts` and `rescue.service.ts`
2. **Add new endpoint**: Update `rescue.controller.ts`
3. **Add tests**: Update `rescue.service.spec.ts`
4. **Update docs**: Update relevant documentation files

## References

- **On-Call Troubleshooting**: `oracle/ON_CALL_TROUBLESHOOTING.md`
- **Quick Reference**: `oracle/RESCUE_QUICK_REFERENCE.md`
- **Module README**: `oracle/src/rescue/README.md`
- **NestJS Bull Queue**: https://docs.nestjs.com/techniques/queues
- **Bull Documentation**: https://github.com/OptimalBits/bull

## Status

✅ **COMPLETE** - All requirements implemented and documented

- ✅ CLI tool with `npm run oracle:rescue {jobId}`
- ✅ Manual submission tool (force-submit)
- ✅ Audit logging for all operations
- ✅ Force fail for invalid/malicious requests
- ✅ On-call troubleshooting guide
- ✅ REST API for programmatic access
- ✅ Comprehensive documentation
- ✅ Unit and integration tests
- ✅ Safety features (idempotency, validation)
- ✅ Integrated in main application

## Contact

For questions or issues with the rescue feature:
- Review documentation in `oracle/` directory
- Check on-call guide for troubleshooting
- Escalate to senior engineer if needed
