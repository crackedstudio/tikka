# Webhook System

Reliable webhook delivery system with retry logic, payload signing, and delivery tracking.

## Features

- **Delivery State Machine**: Tracks webhook deliveries through pending → sending → success/failed states
- **Automatic Retries**: Exponential backoff retry schedule (1s, 2s, 4s, 8s, 16s)
- **Payload Signing**: HMAC-SHA256 signatures for webhook security
- **Idempotency**: Event IDs prevent duplicate deliveries
- **Delivery Tracking**: Full audit trail of all delivery attempts

## Architecture

### Entities

- **WebhookEntity**: Registered webhook endpoints with supported events
- **WebhookDeliveryEntity**: Individual delivery attempts with state tracking

### Components

- **WebhookService**: Dispatches events and manages webhook registration
- **WebhookProcessor**: BullMQ worker that handles actual HTTP delivery

## Usage

### Register a Webhook

```typescript
const webhook = await webhookService.registerWebhook(
  'https://example.com/webhook',
  ['RaffleCreated', 'RaffleFinalized'],
  'optional-signing-secret' // Auto-generated if not provided
);
```

### Dispatch an Event

```typescript
await webhookService.dispatchEvent({
  eventType: 'RaffleCreated',
  raffleId: 123,
  timestamp: new Date(),
  data: { name: 'My Raffle', prize: '1000 XLM' }
});
```

### Check Delivery Status

```typescript
const deliveries = await webhookService.getDeliveryStatus('event-id');
```

## Webhook Payload Format

```json
{
  "eventId": "abc123...",
  "eventType": "RaffleCreated",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "data": {
    "raffleId": 123,
    "name": "My Raffle"
  }
}
```

## HTTP Headers

- `Content-Type`: `application/json`
- `X-Webhook-Signature`: HMAC-SHA256 signature of payload
- `X-Event-Id`: Unique event identifier for idempotency
- `X-Event-Type`: Event type (RaffleCreated, RaffleFinalized)
- `User-Agent`: `Tikka-Indexer-Webhook/1.0`

## Verifying Signatures

```typescript
import * as crypto from 'crypto';

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return signature === expectedSignature;
}
```

## Delivery States

- `PENDING`: Queued for delivery
- `SENDING`: Currently being delivered
- `SUCCESS`: Successfully delivered (2xx response)
- `FAILED`: Temporary failure, will retry
- `PERMANENT_FAILURE`: Max retries exceeded

## Retry Schedule

| Attempt | Delay |
|---------|-------|
| 1       | 0s    |
| 2       | 1s    |
| 3       | 2s    |
| 4       | 4s    |
| 5       | 8s    |

After 5 attempts, delivery is marked as `PERMANENT_FAILURE`.

## Idempotency

Event IDs are generated from `eventType:raffleId:timestamp` hash. Duplicate events are automatically suppressed.

## Testing

```bash
cd indexer
npm run test -- webhook
```

## Monitoring

Track webhook health via:
- Webhook `failureCount` field
- Delivery status distribution
- `lastFailureAt` timestamps
