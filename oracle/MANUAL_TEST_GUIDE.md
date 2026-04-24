# Oracle Rescue Tool - Manual Testing Guide

This guide provides step-by-step instructions for manually testing the Oracle Rescue Tool.

## Prerequisites

1. Node.js installed
2. Dependencies installed: `pnpm install` or `npm install`
3. Oracle service configured with environment variables
4. Redis running (for queue operations)

## Test 1: CLI Help Command

**Purpose**: Verify CLI is accessible and displays help

**Command**:
```bash
npm run oracle:rescue help
```

**Expected Output**:
```
Oracle Rescue CLI - Manual intervention tool for failed oracle jobs

USAGE:
  npm run oracle:rescue <command> [arguments] [options]

COMMANDS:
  re-enqueue <jobId>
  force-submit <raffleId> <requestId>
  force-fail <jobId>
  list-failed
  list-all
  logs

EXAMPLES:
  npm run oracle:rescue re-enqueue 12345 --operator alice --reason "RPC timeout, retrying"
  ...
```

**Status**: ✅ Ready to test

---

## Test 2: List Failed Jobs

**Purpose**: Verify CLI can list failed jobs

**Command**:
```bash
npm run oracle:rescue list-failed
```

**Expected Output** (if no failed jobs):
```
Fetching failed jobs...

No failed jobs found.
```

**Expected Output** (if failed jobs exist):
```
Fetching failed jobs...

Found 2 failed job(s):

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

**Status**: ✅ Ready to test

---

## Test 3: List All Jobs

**Purpose**: Verify CLI can list all jobs by state

**Command**:
```bash
npm run oracle:rescue list-all
```

**Expected Output**:
```
Fetching all jobs...

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

**Status**: ✅ Ready to test

---

## Test 4: View Rescue Logs

**Purpose**: Verify audit logging works

**Command**:
```bash
npm run oracle:rescue logs --limit 10
```

**Expected Output** (if no logs):
```
Fetching rescue logs...

No rescue logs found.
```

**Expected Output** (if logs exist):
```
Fetching rescue logs...

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

**Status**: ✅ Ready to test

---

## Test 5: Re-enqueue a Job (Dry Run)

**Purpose**: Test re-enqueue command syntax

**Command**:
```bash
npm run oracle:rescue re-enqueue 12345 --operator alice --reason "Test re-enqueue"
```

**Expected Behavior**:
- If job exists and raffle not finalized: Success message with new job ID
- If job not found: Error message "Job 12345 not found"
- If raffle finalized: Error message "Raffle already finalized"

**Expected Success Output**:
```
Re-enqueuing job 12345...
✓ Success: Job re-enqueued successfully
  New Job ID: 12346
```

**Expected Error Output** (job not found):
```
Re-enqueuing job 12345...
✗ Failed: Job 12345 not found
```

**Status**: ⚠️ Requires actual job ID from queue

---

## Test 6: Force Submit (Dry Run)

**Purpose**: Test force submit command syntax

**Command**:
```bash
npm run oracle:rescue force-submit 42 req_abc123 --operator bob --reason "Test force submit" --prize 1000
```

**Expected Behavior**:
- If raffle not finalized: Computes randomness and submits to contract
- If raffle finalized: Error message "Raffle already finalized"
- If contract error: Error message with details

**Expected Success Output**:
```
Force submitting randomness for raffle 42...
✓ Success: Randomness submitted successfully
  Transaction Hash: abc123def456...
```

**Expected Error Output** (already finalized):
```
Force submitting randomness for raffle 42...
✗ Failed: Raffle 42 already finalized
```

**Status**: ⚠️ Requires valid raffle ID and contract access

---

## Test 7: Force Fail a Job (Dry Run)

**Purpose**: Test force fail command syntax

**Command**:
```bash
npm run oracle:rescue force-fail 12345 --operator alice --reason "Test force fail"
```

**Expected Behavior**:
- If job exists: Marks as failed and removes from queue
- If job not found: Error message "Job 12345 not found"

**Expected Success Output**:
```
Force failing job 12345...
✓ Success: Job marked as failed and removed from queue
```

**Expected Error Output** (job not found):
```
Force failing job 12345...
✗ Failed: Job 12345 not found
```

**Status**: ⚠️ Requires actual job ID from queue

---

## Test 8: API Endpoint - List Failed Jobs

**Purpose**: Test REST API endpoint

**Command**:
```bash
curl http://localhost:3003/rescue/failed-jobs
```

**Expected Output**:
```json
[
  {
    "id": "12345",
    "raffleId": 42,
    "requestId": "req_abc123",
    "attempts": 5,
    "failedReason": "RPC timeout after 5 retries",
    "timestamp": 1705318200000
  }
]
```

**Status**: ⚠️ Requires oracle service running

---

## Test 9: API Endpoint - Re-enqueue

**Purpose**: Test REST API re-enqueue endpoint

**Command**:
```bash
curl -X POST http://localhost:3003/rescue/re-enqueue \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "12345",
    "operator": "alice",
    "reason": "Test re-enqueue via API"
  }'
```

**Expected Output**:
```json
{
  "success": true,
  "message": "Job re-enqueued successfully",
  "newJobId": "12346"
}
```

**Status**: ⚠️ Requires oracle service running and valid job ID

---

## Test 10: API Endpoint - Get Rescue Logs

**Purpose**: Test REST API logs endpoint

**Command**:
```bash
curl http://localhost:3003/rescue/logs?limit=10
```

**Expected Output**:
```json
[
  {
    "timestamp": "2024-01-15T10:35:00.000Z",
    "action": "FORCE_SUBMIT",
    "raffleId": 42,
    "requestId": "req_abc123",
    "operator": "bob",
    "reason": "All retries exhausted, manual submission",
    "result": "SUCCESS",
    "details": {
      "txHash": "abc123...",
      "ledger": 12345,
      "method": "VRF",
      "prizeAmount": 1000
    }
  }
]
```

**Status**: ⚠️ Requires oracle service running

---

## Test 11: Unit Tests

**Purpose**: Run automated unit tests

**Command**:
```bash
npm test src/rescue/rescue.service.spec.ts
```

**Expected Output**:
```
PASS  src/rescue/rescue.service.spec.ts
  RescueService
    reEnqueueJob
      ✓ should re-enqueue a failed job successfully
      ✓ should fail if job not found
      ✓ should fail if raffle already finalized
    forceSubmit
      ✓ should force submit for low-stakes raffle using PRNG
      ✓ should force submit for high-stakes raffle using VRF
      ✓ should auto-fetch prize amount if not provided
      ✓ should fail if raffle already finalized
      ✓ should fail if transaction submission fails
    forceFail
      ✓ should force fail a job successfully
      ✓ should fail if job not found
    getFailedJobs
      ✓ should return list of failed jobs
    getAllJobs
      ✓ should return jobs by state
    getRescueLogs
      ✓ should return rescue logs
      ✓ should filter logs by raffle ID

Test Suites: 1 passed, 1 total
Tests:       15 passed, 15 total
```

**Status**: ✅ Ready to test

---

## Test 12: TypeScript Compilation

**Purpose**: Verify no TypeScript errors

**Command**:
```bash
npm run build
```

**Expected Output**:
```
Successfully compiled
```

**Status**: ✅ Ready to test

---

## Quick Smoke Test Checklist

Run these commands in order to verify basic functionality:

```bash
# 1. Check CLI help
npm run oracle:rescue help

# 2. List failed jobs
npm run oracle:rescue list-failed

# 3. List all jobs
npm run oracle:rescue list-all

# 4. View rescue logs
npm run oracle:rescue logs --limit 10

# 5. Run unit tests
npm test src/rescue/rescue.service.spec.ts

# 6. Build TypeScript
npm run build
```

**Expected Results**:
- ✅ Help displays correctly
- ✅ Commands execute without errors
- ✅ Unit tests pass
- ✅ TypeScript compiles successfully

---

## Integration Test Scenario

**Scenario**: Complete rescue workflow

### Step 1: Simulate a Failed Job
```bash
# Check for failed jobs
npm run oracle:rescue list-failed
```

### Step 2: Re-enqueue the Job
```bash
# Re-enqueue job (replace 12345 with actual job ID)
npm run oracle:rescue re-enqueue 12345 \
  --operator alice \
  --reason "RPC timeout, retrying with backup endpoint"
```

### Step 3: Verify Audit Log
```bash
# Check logs to verify operation was logged
npm run oracle:rescue logs --limit 5
```

### Step 4: If Re-enqueue Fails, Force Submit
```bash
# Force submit (replace with actual raffle ID and request ID)
npm run oracle:rescue force-submit 42 req_abc123 \
  --operator bob \
  --reason "All retries exhausted, manual submission"
```

### Step 5: Verify Transaction
```bash
# Check logs for transaction hash
npm run oracle:rescue logs --raffle 42
```

---

## Troubleshooting

### Issue: "Command not found: npm"
**Solution**: Install Node.js and npm

### Issue: "Cannot find module"
**Solution**: Run `pnpm install` or `npm install`

### Issue: "Redis connection failed"
**Solution**: Ensure Redis is running and `REDIS_HOST`/`REDIS_PORT` are configured

### Issue: "Job not found"
**Solution**: Use `list-failed` to get actual job IDs from the queue

### Issue: "Raffle already finalized"
**Solution**: This is expected behavior - raffle has already been processed

### Issue: "Transaction submission failed"
**Solution**: Check RPC endpoint health and oracle keypair has funds

---

## Test Results Template

Use this template to document your test results:

```
# Oracle Rescue Tool - Test Results

Date: ___________
Tester: ___________
Environment: ___________

## Test Results

| Test | Status | Notes |
|------|--------|-------|
| CLI Help | ⬜ Pass / ⬜ Fail | |
| List Failed Jobs | ⬜ Pass / ⬜ Fail | |
| List All Jobs | ⬜ Pass / ⬜ Fail | |
| View Logs | ⬜ Pass / ⬜ Fail | |
| Re-enqueue Job | ⬜ Pass / ⬜ Fail | |
| Force Submit | ⬜ Pass / ⬜ Fail | |
| Force Fail | ⬜ Pass / ⬜ Fail | |
| API - List Failed | ⬜ Pass / ⬜ Fail | |
| API - Re-enqueue | ⬜ Pass / ⬜ Fail | |
| API - Get Logs | ⬜ Pass / ⬜ Fail | |
| Unit Tests | ⬜ Pass / ⬜ Fail | |
| TypeScript Build | ⬜ Pass / ⬜ Fail | |

## Overall Status
⬜ All tests passed
⬜ Some tests failed (see notes)

## Issues Found
(List any issues discovered during testing)

## Recommendations
(List any recommendations for improvements)
```

---

## Conclusion

The Oracle Rescue Tool is ready for testing. Follow the tests in order, starting with the simple CLI commands and progressing to more complex operations.

For automated testing, run the unit tests:
```bash
npm test src/rescue/rescue.service.spec.ts
```

For manual testing, start with:
```bash
npm run oracle:rescue help
npm run oracle:rescue list-failed
npm run oracle:rescue logs
```

**Note**: Some tests require actual job IDs from the queue and a running oracle service. The unit tests can be run without these dependencies.
