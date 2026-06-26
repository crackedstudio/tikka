# Oracle Component Health Monitoring

## Overview

The oracle health system now provides detailed component-level health monitoring, allowing operators to identify which specific oracle capability is impaired (if any).

## Components

Each component can have one of three statuses:
- **healthy**: Component is operating normally
- **degraded**: Component has reduced capacity but is still functional
- **unhealthy**: Component is not operational

### Listener (Event Stream)
Monitors the connection to the Stellar Horizon event stream.

**Transitions:**
- `connected` → listener is `healthy` and receiving events
- `reconnecting` → listener is `degraded` (connection lost, attempting recovery)
- `disconnected` → listener is `unhealthy` (stream unavailable)

**Impact:** If unhealthy, the oracle cannot receive randomness requests.

### Queue
Monitors the work queue depth and processing rate.

**Transitions:**
- `depth ≤ 20` → `healthy` (normal queue depth)
- `20 < depth ≤ 50` → `degraded` (elevated backlog)
- `depth > 50` → `unhealthy` (critically high backlog)

**Impact:** If degraded/unhealthy, requests may be delayed or dropped.

### Key Provider
Monitors the oracle's signing key availability (env, AWS KMS, GCP KMS, etc.).

**Manual updates via:**
```typescript
healthService.updateKeyProviderStatus('healthy', 'Key loaded successfully');
healthService.updateKeyProviderStatus('unhealthy', 'Key provider unavailable');
```

**Impact:** If unhealthy, the oracle cannot sign VRF proofs or transactions.

### Randomness Provider (VRF)
Monitors the Verifiable Random Function (VRF) service availability.

**Manual updates via:**
```typescript
healthService.updateRandomnessProviderStatus('healthy');
healthService.updateRandomnessProviderStatus('unhealthy', 'VRF service unavailable');
```

**Impact:** If unhealthy, the oracle cannot generate randomness proofs.

### Network (RPC Connection)
Monitors the connection to the Stellar network RPC endpoint.

**Manual updates via:**
```typescript
healthService.updateNetworkStatus('healthy');
healthService.updateNetworkStatus('degraded', 'RPC latency high');
healthService.updateNetworkStatus('unhealthy', 'RPC unreachable');
```

**Impact:** If unhealthy, the oracle cannot submit transactions to the network.

### Submitter (Transaction Submission)
Monitors the transaction submission success rate.

**Automatic updates:**
- Records successes: `recordSuccess(requestId)`
- Records failures: `recordFailure(requestId, raffleId, error)`
- Calculates failure rate:
  - `rate ≤ 10%` → `healthy`
  - `10% < rate ≤ 50%` → `degraded`
  - `rate > 50%` → `unhealthy`

**Manual updates via:**
```typescript
healthService.updateSubmitterStatus('unhealthy', 'Transaction pool full');
```

**Impact:** If unhealthy, successfully signed transactions cannot be submitted.

## API Endpoints

### GET /health
Simple health status endpoint for Kubernetes probes.

```json
{
  "status": "healthy|degraded|unhealthy",
  "timestamp": "2026-05-30T12:00:00Z",
  "pendingLagRequests": 0
}
```

### GET /oracle/components
Detailed component health status.

```json
{
  "timestamp": "2026-05-30T12:00:00Z",
  "components": {
    "listener": {
      "status": "healthy",
      "message": "Listener connected and receiving events",
      "lastCheckAt": "2026-05-30T12:00:00Z"
    },
    "queue": {
      "status": "healthy",
      "message": "Queue depth normal: 5 items",
      "depth": 5,
      "depthByTier": { "high": 2, "medium": 2, "low": 1 },
      "lastCheckAt": "2026-05-30T12:00:00Z"
    },
    "keyProvider": { ... },
    "randomnessProvider": { ... },
    "network": { ... },
    "submitter": { ... }
  },
  "overallStatus": "healthy"
}
```

### GET /oracle/status
Full oracle status with component health, metrics, and lag info.

## Kubernetes Probe Configuration

The deployment already uses `/health` for readiness and liveness probes. The status logic is now component-aware:

- **Readiness:** Fails if any critical component (listener, queue, keyProvider, network) is unhealthy
- **Liveness:** Same as readiness (pod restart if critical component fails)

For more granular probing, operators can use `/oracle/components` to monitor specific components.

## Implementation Example

In your service initialization:

```typescript
// Mark key provider as ready
this.healthService.updateKeyProviderStatus('healthy', 'Key loaded from AWS KMS');

// Mark randomness provider as ready
this.healthService.updateRandomnessProviderStatus('healthy');

// Mark network as healthy
this.healthService.updateNetworkStatus('healthy');

// Track transaction submissions
try {
  await submitTransaction(tx);
  this.healthService.recordSuccess(requestId);
} catch (error) {
  this.healthService.recordFailure(requestId, raffleId, error.message);
}
```

## Component Dependency Tree

```
Oracle Overall Health
├── Healthy: All critical components healthy
├── Degraded: At least one component degraded, none unhealthy
└── Unhealthy: At least one critical component unhealthy

Critical Components (fail oracle):
├── listener (cannot receive requests)
├── queue (cannot process requests)
├── keyProvider (cannot sign)
└── network (cannot submit)

Secondary Components (degrade oracle):
├── randomnessProvider (affects randomness quality)
└── submitter (high failure rate)
```

## Monitoring & Alerting

Operators should alert on:
1. **Any unhealthy component** - Immediate action needed
2. **Degraded listener/queue** - Monitor for escalation
3. **Degraded submitter** - Investigate transaction issues
4. **Multiple degraded components** - System under stress

Example alert:
```
if (components.listener.status === 'unhealthy') {
  alert('Oracle Event Stream Down - check Horizon status');
}
if (components.queue.status === 'unhealthy') {
  alert('Oracle Queue Overloaded - requests may be dropped');
}
```
