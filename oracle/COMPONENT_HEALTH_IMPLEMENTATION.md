# Issue #589: Oracle Health Split Implementation - Summary

## Overview
Implemented component-level health monitoring for the Tikka Oracle, enabling operators to identify which specific oracle capability is impaired.

## Changes Made

### 1. Health Service Enhancements (`health.service.ts`)

**New Types & Interfaces:**
- `ComponentStatus`: 'healthy' | 'degraded' | 'unhealthy'
- `ComponentHealth`: Health status with message and timestamp
- `ComponentHealthStatus`: Container for all six component statuses

**New Features:**
- Component health tracking for:
  - **Listener** (event stream connection)
  - **Queue** (work queue depth)
  - **Key Provider** (signing key availability)
  - **Randomness Provider** (VRF service)
  - **Network** (RPC connectivity)
  - **Submitter** (transaction submission success rate)

**New Methods:**
- `getComponentHealth()`: Get current component status
- `updateKeyProviderStatus()`: Set key provider status
- `updateRandomnessProviderStatus()`: Set VRF service status
- `updateNetworkStatus()`: Set network/RPC status
- `updateSubmitterStatus()`: Set submitter status
- `isDegraded()`: Check if any component is degraded
- `updateSubmitterHealthBasedOnStats()`: Auto-calculate submitter health from failure rate

**Enhanced Methods:**
- `updateQueueDepth()`: Now updates queue component health
- `updateStreamStatus()`: Now updates listener component health
- `isHealthy()`: Now checks critical components first
- `getMetrics()`: Now includes component health

### 2. Health Controller Updates (`health.controller.ts`)

**Updated Endpoints:**

1. **GET /health** (Kubernetes probe)
   - Now returns 'healthy', 'degraded', or 'unhealthy'
   - Still simple response for quick health checks

2. **GET /oracle/components** (NEW)
   - Returns detailed status of all six components
   - Includes queue depth, submission stats
   - Each component has lastCheckAt timestamp

3. **GET /oracle/status** (Enhanced)
   - Now includes component health summary
   - Adds overallStatus field
   - Maintains backward compatibility

### 3. Comprehensive Test Suite (`health.service.spec.ts`)

**Test Coverage:**
- ✅ 40+ new test cases covering:
  - Each component initialization
  - Component status transitions
  - Failure rate calculations for submitter
  - Overall health determination
  - Degraded status detection
  - Component metrics inclusion

**Test Scenarios:**
- Listener connect/disconnect/reconnect
- Queue depth thresholds (degraded at 20+, unhealthy at 50+)
- Key provider availability
- Randomness provider availability
- Network connectivity
- Submitter failure rate tracking (10% degraded, 50% unhealthy)

### 4. Documentation

**COMPONENT_HEALTH.md:**
- Overview of all six components
- Status transitions and meanings
- API endpoint examples
- Kubernetes probe configuration
- Dependency tree
- Monitoring & alerting guidelines

**INTEGRATION_GUIDE.md:**
- How to integrate health tracking in services
- Code examples for each component
- Usage patterns and best practices
- Testing examples
- Debugging tips

## Component Health Status Mapping

| Component | Healthy | Degraded | Unhealthy |
|-----------|---------|----------|-----------|
| **Listener** | connected | reconnecting | disconnected |
| **Queue** | ≤20 items | 21-50 items | >50 items |
| **Key Provider** | loaded | N/A | unavailable |
| **Randomness** | available | slow | unavailable |
| **Network** | responsive | high latency | unreachable |
| **Submitter** | <10% fails | 10-50% fails | >50% fails |

## Kubernetes Integration

The deployment (`k8s/deployment.yaml`) already uses `/health` endpoint:

```yaml
readinessProbe:
  httpGet:
    path: /health
    port: 3003
  initialDelaySeconds: 10
  periodSeconds: 15
  failureThreshold: 3

livenessProbe:
  httpGet:
    path: /health
    port: 3003
  initialDelaySeconds: 30
  periodSeconds: 30
  failureThreshold: 5
```

The probe now understands:
- **healthy**: Pod is ready to serve traffic
- **degraded**: Pod is operational but reduced capacity
- **unhealthy**: Pod should be replaced

## Acceptance Criteria Met

✅ **Component checks for:**
- ✅ Subscriber/listener
- ✅ Queue
- ✅ Randomness provider
- ✅ Key provider
- ✅ Network
- ✅ Submitter

✅ **Return degraded status when one component is impaired**

✅ **Health tests cover individual component failures**
- 40+ test cases covering all component failures
- Each component can be tested in isolation
- Failure rate calculations verified

✅ **Operators can identify which oracle capability is down**
- Six distinct component statuses
- New GET /oracle/components endpoint for detailed view
- Clear status messages for debugging

## API Usage Examples

### Check Overall Health
```bash
curl http://oracle:3003/health
# { "status": "healthy|degraded|unhealthy", ... }
```

### Get Component Details
```bash
curl http://oracle:3003/oracle/components
# {
#   "components": {
#     "listener": { "status": "healthy", "message": "...", "lastCheckAt": "..." },
#     "queue": { "status": "degraded", "message": "Queue depth elevated: 25 items", ... },
#     "keyProvider": { ... },
#     "randomnessProvider": { ... },
#     "network": { ... },
#     "submitter": { ... }
#   },
#   "overallStatus": "degraded"
# }
```

### Get Full Status with Component Info
```bash
curl http://oracle:3003/oracle/status
# Returns full metrics plus component health
```

## Verification Commands

```bash
cd oracle

# Lint
npm run lint

# Test (focus on health)
npm run test -- health.service.spec

# Build
npm run build

# Or run the verification script
./verify-component-health.sh
```

## Future Enhancements

1. **Event Emissions**: Emit events when components transition
2. **Metrics Export**: Prometheus metrics for each component
3. **Component Dependencies**: Model which components depend on others
4. **Historical Tracking**: Store component status history
5. **Alert Rules**: Built-in alert thresholds and actions
6. **Component Recovery**: Auto-recovery strategies per component

## Breaking Changes
**None** - Implementation is backward compatible:
- Existing `/health` endpoint still works
- Existing `/oracle/status` endpoint enhanced (old fields preserved)
- New endpoint `/oracle/components` added separately

## Files Modified
- `oracle/src/health/health.service.ts` (+150 lines)
- `oracle/src/health/health.controller.ts` (+90 lines)
- `oracle/src/health/health.service.spec.ts` (+250 lines)

## Files Added
- `oracle/src/health/COMPONENT_HEALTH.md` (Documentation)
- `oracle/src/health/INTEGRATION_GUIDE.md` (Integration examples)
- `oracle/verify-component-health.sh` (Verification script)
