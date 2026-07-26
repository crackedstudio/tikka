# Oracle Consensus Threshold Implementation

## Overview

This document describes the implementation of oracle consensus validation for the multi-oracle coordinator system. Consensus validation ensures that multiple oracles must agree on the same randomness output before submitting to the smart contract, preventing a single dishonest oracle from manipulating draw results.

## Features Implemented

### 1. Configurable Consensus Threshold

**Environment Variable:** `ORACLE_CONSENSUS_THRESHOLD`

- **Default:** `Math.floor(N/2) + 1` (majority of registered oracles)
- **Description:** Minimum number of oracles that must agree on the same seed hash
- **Example:** With 3 oracles, default is 2 (majority)

**Environment Variable:** `ORACLE_CONSENSUS_TIMEOUT_MS`

- **Default:** `30000` (30 seconds)
- **Description:** Maximum time to wait for oracle consensus before logging a warning
- **Example:** `ORACLE_CONSENSUS_TIMEOUT_MS=60000` for 1 minute

### 2. Consensus Validation Logic

The coordinator now validates that at least `ORACLE_CONSENSUS_THRESHOLD` oracles agree on the same seed before aggregating results:

1. **Seed Hashing:** Each oracle's seed is hashed using SHA-256
2. **Grouping:** Seeds are grouped by their hash value
3. **Consensus Check:** The largest group must contain at least `consensusThreshold` oracles
4. **Selection:** If consensus is reached, only oracles from the consensus group are used
5. **Fallback:** If consensus fails, the system falls back to local-only submission

### 3. Structured Logging

The implementation includes comprehensive structured logging:

#### Success Logs
```typescript
{
  message: 'Oracle consensus reached',
  requestId: 'req123',
  consensusSize: 3,
  consensusThreshold: 2,
  selectedOracles: ['oracle-a', 'oracle-b'],
  seedHash: '0x...'
}
```

#### Warning Logs - Consensus Failure
```typescript
{
  message: 'Oracle consensus not reached',
  requestId: 'req123',
  totalResponses: 3,
  threshold: 2,
  consensusThreshold: 2,
  seedGroups: {
    '0xabc...': 1,
    '0xdef...': 1,
    '0x123...': 1
  },
  largestGroup: 1
}
```

#### Warning Logs - Consensus Timeout
```typescript
{
  message: 'Consensus timeout: threshold not met within timeout period',
  raffleId: 123,
  requestId: 'req123',
  submissions: 2,
  threshold: 2,
  consensusThreshold: 2,
  consensusReached: false,
  seedGroups: { '0xabc...': 1, '0xdef...': 1 },
  timeoutMs: 30000,
  elapsedMs: 30005
}
```

### 4. Enhanced Types

Updated `AggregatedRandomness` type:
```typescript
export interface AggregatedRandomness {
  seed: string;
  proof: string;
  submittedBy: string[];
  consensusReached?: boolean;  // NEW
  seedHash?: string;           // NEW
}
```

Updated `SubmissionTracker` type:
```typescript
export interface SubmissionTracker {
  requestId: string;
  raffleId: number;
  submissions: Map<string, OracleSubmission>;
  threshold: number;
  completed: boolean;
  aggregatedSeed?: string;
  consensusTimeout?: NodeJS.Timeout;    // NEW
  consensusStartTime?: number;          // NEW
}
```

## Configuration Examples

### 2-of-3 Oracles (Majority)

```bash
# Three oracles registered
ORACLE_REGISTRY=oracle-a:GCXXX...:1:local,oracle-b:GDYYY...:1,oracle-c:GEZZ...:1

# Consensus requires 2 to agree (majority)
ORACLE_CONSENSUS_THRESHOLD=2

# 30 second timeout for consensus
ORACLE_CONSENSUS_TIMEOUT_MS=30000
```

**Behavior:**
- ✅ Accepts: 2 oracles agree on same seed
- ✅ Accepts: 3 oracles agree (unanimous)
- ❌ Rejects: All 3 oracles produce different seeds
- ✅ Protects: Single dishonest oracle cannot cause submission

### 3-of-3 Oracles (Unanimous)

```bash
ORACLE_REGISTRY=oracle-a:GCXXX...:1:local,oracle-b:GDYYY...:1,oracle-c:GEZZ...:1

# Consensus requires all 3 to agree (unanimous)
ORACLE_CONSENSUS_THRESHOLD=3

ORACLE_CONSENSUS_TIMEOUT_MS=30000
```

**Behavior:**
- ✅ Accepts: All 3 oracles agree on same seed
- ❌ Rejects: Only 2 of 3 oracles agree
- ❌ Rejects: All 3 oracles produce different seeds

### Single Oracle Mode

```bash
ORACLE_MODE=single

# Consensus is automatic with single oracle
ORACLE_CONSENSUS_THRESHOLD=1
```

## Testing

### Unit Tests

Comprehensive test suite in `multi-oracle-coordinator-consensus.spec.ts`:

1. **2-of-3 Consensus Tests:**
   - ✅ Accepts when 2 oracles agree
   - ✅ Rejects when all 3 disagree
   - ✅ Accepts when all 3 agree (unanimous)
   - ✅ Prevents single dishonest oracle attack

2. **3-of-3 Consensus Tests:**
   - ✅ Accepts only when all 3 agree
   - ✅ Rejects when only 2 agree
   - ✅ Rejects when all disagree

3. **Failure Scenarios:**
   - ✅ Falls back when insufficient responses
   - ✅ Falls back when no peers available
   - ✅ Handles network failures gracefully

4. **Submission Tracking:**
   - ✅ Marks ready when consensus threshold met
   - ✅ Does not mark ready without consensus
   - ✅ Handles 3-of-3 unanimous requirement

5. **Edge Cases:**
   - ✅ Single oracle mode
   - ✅ Deterministic selection from large consensus groups

### Running Tests

```bash
cd oracle
npm test -- multi-oracle-coordinator-consensus.spec.ts
```

## Security Guarantees

### Byzantine Fault Tolerance

With `N` oracles and consensus threshold `T`:

- **2-of-3 setup (T=2):** System can tolerate 1 Byzantine (dishonest) oracle
- **3-of-5 setup (T=3):** System can tolerate 2 Byzantine oracles
- **General formula:** Tolerates `N - T` Byzantine oracles

### Attack Prevention

1. **Single Dishonest Oracle:**
   - ❌ Cannot force submission without consensus
   - ✅ System falls back to local-only if consensus not reached

2. **Coordinated Attack:**
   - Requires `T` dishonest oracles to agree on malicious value
   - Majority consensus (T = floor(N/2) + 1) prevents minority attacks

3. **Seed Manipulation:**
   - Seeds are hashed before comparison (SHA-256)
   - Hash collisions are cryptographically infeasible
   - Deterministic selection from consensus group

## Migration Guide

### Existing Deployments

1. **No configuration change required:**
   - Default consensus threshold = majority
   - Backwards compatible with existing multi-oracle setups

2. **To enable stricter consensus:**
   ```bash
   # Add to .env
   ORACLE_CONSENSUS_THRESHOLD=3  # For 3-of-3 unanimous
   ```

3. **To adjust timeout:**
   ```bash
   # Add to .env
   ORACLE_CONSENSUS_TIMEOUT_MS=60000  # 60 seconds
   ```

### Monitoring

Monitor the following logs for consensus health:

1. **Success rate:** Count of "Oracle consensus reached" messages
2. **Failure rate:** Count of "Oracle consensus not reached" messages
3. **Timeout rate:** Count of "Consensus timeout" messages
4. **Seed distribution:** Analyze `seedGroups` in logs to detect issues

## Acceptance Criteria

✅ **With 3 oracles, randomness is only submitted when ≥ 2 agree on the output**
- Implemented in `checkConsensus()` method
- Validated in unit tests: `2-of-3 consensus` suite

✅ **A single dishonest oracle cannot cause a submission without consensus**
- Dishonest oracle's seed is excluded from consensus group
- System falls back to local-only if consensus fails
- Validated in unit test: "prevents a single dishonest oracle from causing submission"

✅ **Configurable consensus threshold via environment variable**
- `ORACLE_CONSENSUS_THRESHOLD` env var implemented
- Default: `Math.floor(N/2) + 1` (majority)
- Validation ensures threshold is between 1 and N

✅ **Structured warning when consensus not reached within timeout**
- Timeout mechanism implemented in `startTracking()`
- Warning logged by `checkConsensusTimeout()`
- Includes all relevant details: submissions, seed groups, elapsed time

✅ **Comprehensive unit tests for all scenarios**
- 2-of-3 tests: majority consensus
- 3-of-3 tests: unanimous consensus  
- Failure scenarios: insufficient quorum, network failures
- Edge cases: single oracle, deterministic selection

## Files Modified

1. **oracle/.env.example** - Added configuration documentation
2. **oracle/src/multi-oracle/multi-oracle.types.ts** - Enhanced types
3. **oracle/src/multi-oracle/oracle-registry.service.ts** - Added consensus threshold config
4. **oracle/src/multi-oracle/multi-oracle-coordinator.service.ts** - Core consensus logic
5. **oracle/src/multi-oracle/multi-oracle-coordinator.service.spec.ts** - Updated existing tests
6. **oracle/src/multi-oracle/multi-oracle-coordinator-consensus.spec.ts** - New comprehensive tests

## Future Enhancements

1. **Cryptographic Signatures:** Verify each oracle signed its seed with its private key
2. **Reputation System:** Track oracle reliability over time
3. **Dynamic Thresholds:** Adjust consensus threshold based on prize value
4. **Slashing:** Penalize oracles that consistently disagree
5. **Metrics Dashboard:** Real-time consensus health monitoring
