# DLQ Admin API

HTTP endpoints for managing the Dead Letter Queue (DLQ) in production environments.

## Overview

The DLQ Admin API provides operators with HTTP-based control over DLQ replay operations, eliminating the need for direct shell access to pods. This is particularly useful in Kubernetes environments where `kubectl exec` is restricted.

## Authentication

All endpoints require API key authentication via the `x-api-key` header:

```bash
curl -H "x-api-key: YOUR_API_KEY" https://api.example.com/admin/dlq/status
```

Configure the API key using the `INTERNAL_API_KEY` environment variable. If not set, the endpoints are accessible without authentication (not recommended for production).

## Endpoints

### POST /admin/dlq/replay

Triggers asynchronous replay of DLQ entries.

**Request Body:**

```json
{
  "ids": ["uuid1", "uuid2", "uuid3"]  // Optional: specific entry IDs to replay
}
```

- If `ids` is provided: replays only those specific entries
- If `ids` is omitted: replays all eligible DLQ entries

**Response (202 Accepted):**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Replay started for all eligible DLQ entries"
}
```

**Eligibility Rules:**

Entries are eligible for replay if:
1. `retryable` flag is `true` (PARSE_ERROR and SCHEMA_UNSUPPORTED are excluded)
2. `retryCount` is less than `MAX_RETRIES` (default: 5)
3. `replayedAt` is null (unless `forceReplay` is used internally)

**Example:**

```bash
# Replay all eligible entries
curl -X POST https://api.example.com/admin/dlq/replay \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# Replay specific entries
curl -X POST https://api.example.com/admin/dlq/replay \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ids": ["uuid1", "uuid2"]}'
```

---

### GET /admin/dlq/status

Returns current DLQ metrics and last replay metadata.

**Response (200 OK):**

```json
{
  "depth": 42,
  "lastReplayAt": "2024-01-15T10:30:00.000Z",
  "lastReplayCount": 15
}
```

**Fields:**

- `depth` (number): Current number of entries in the DLQ
- `lastReplayAt` (string | null): ISO8601 timestamp of the last completed replay (null if never replayed)
- `lastReplayCount` (number): Number of entries successfully replayed in the last operation

**Example:**

```bash
curl https://api.example.com/admin/dlq/status \
  -H "x-api-key: YOUR_API_KEY"
```

---

## Usage Patterns

### Monitor DLQ Health

```bash
# Check DLQ depth periodically
watch -n 30 'curl -s https://api.example.com/admin/dlq/status -H "x-api-key: $API_KEY"'
```

### Automated Replay via CI/CD

```yaml
# GitHub Actions example
- name: Replay DLQ if depth exceeds threshold
  run: |
    DEPTH=$(curl -s https://api.example.com/admin/dlq/status \
      -H "x-api-key: ${{ secrets.API_KEY }}" | jq .depth)
    
    if [ "$DEPTH" -gt 10 ]; then
      curl -X POST https://api.example.com/admin/dlq/replay \
        -H "x-api-key: ${{ secrets.API_KEY }}" \
        -H "Content-Type: application/json" \
        -d '{}'
    fi
```

### Kubernetes CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: dlq-replay
spec:
  schedule: "0 */4 * * *"  # Every 4 hours
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: dlq-replay
            image: curlimages/curl:latest
            env:
            - name: API_KEY
              valueFrom:
                secretKeyRef:
                  name: indexer-secrets
                  key: internal-api-key
            command:
            - sh
            - -c
            - |
              curl -X POST http://indexer-service:3000/admin/dlq/replay \
                -H "x-api-key: $API_KEY" \
                -H "Content-Type: application/json" \
                -d '{}'
          restartPolicy: OnFailure
```

---

## Implementation Details

### Async Processing

Replay operations execute asynchronously to avoid HTTP timeout issues. The endpoint returns immediately with a `202 Accepted` status and a job ID. Monitor progress using the `/status` endpoint.

### Idempotency

Successfully replayed entries have their `replayedAt` timestamp set, preventing duplicate processing in subsequent replay operations (unless `forceReplay` is used).

### Retry Strategy

- Exponential backoff: `delay = 1000ms * 2^retryCount`
- Max retries: 5 (configurable via `MAX_RETRIES` constant)
- Failed retries increment `retryCount` and update `errorMessage`

### Ledger-Based Replay

When specific IDs are provided, the implementation currently replays entries by ledger range. This ensures temporal consistency but may replay adjacent entries at the same ledger.

---

## Comparison with CLI

| Feature | CLI (`dlq:replay`) | HTTP API |
|---------|-------------------|----------|
| Shell access required | ✅ Yes | ❌ No |
| Kubernetes-friendly | ❌ Requires `kubectl exec` | ✅ Standard HTTP |
| Async execution | ❌ Blocking | ✅ Non-blocking |
| Automation support | Limited | Excellent |
| Authentication | Container access | API key |
| Dry-run mode | ✅ Yes | ❌ Not yet implemented |

---

## Security Considerations

1. **API Key Rotation**: Rotate `INTERNAL_API_KEY` regularly
2. **Network Policy**: Restrict access to admin endpoints via firewall/ingress rules
3. **Rate Limiting**: Consider adding rate limiting for replay endpoints
4. **Audit Logging**: All replay operations are logged with job IDs for traceability

---

## Future Enhancements

- [ ] Dry-run mode via query parameter
- [ ] Job status tracking by job ID
- [ ] Webhook notifications on replay completion
- [ ] Batch size limits for large DLQs
- [ ] Pause/resume support for long-running replays
