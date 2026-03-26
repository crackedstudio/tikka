# Backend Notification Implementation

## Summary

Successfully implemented the backend notification subscription system for the Tikka raffle platform. Users can subscribe to receive notifications when a raffle ends or when they win.

## What Was Implemented

### 1. Database Migration
- **`002_notifications.sql`**: Creates the notifications table
  - Stores user subscriptions with raffle_id and user_address
  - Supports multiple notification channels (email, push)
  - Unique constraint prevents duplicate subscriptions
  - Indexed for efficient queries
  - RLS enabled for future security policies

### 2. Core Service Layer
- **`notification.service.ts`**: Supabase integration service
  - `subscribe()`: Create new subscription
  - `unsubscribe()`: Remove subscription
  - `getUserSubscriptions()`: Get all user subscriptions
  - `getSubscription()`: Get specific subscription
  - `getRaffleSubscribers()`: Get all subscribers for a raffle
  - `isSubscribed()`: Check subscription status

### 3. REST API Layer

#### DTOs
- **`subscribe.dto.ts`**: Request validation
  - `raffleId`: Required integer
  - `channel`: Optional ('email' | 'push')

#### Controller
- **`notifications.controller.ts`**: HTTP endpoints
  - `POST /notifications/subscribe`: Subscribe to raffle
  - `DELETE /notifications/subscribe/:raffleId`: Unsubscribe
  - `GET /notifications/subscriptions`: List user subscriptions

#### Service
- **`notifications.service.ts`**: Business logic layer
  - Delegates to core notification service
  - Handles request/response transformation

#### Module
- **`notifications.module.ts`**: NestJS module configuration
  - Registers controller and services
  - Exports services for use by other modules

### 4. Integration
- Updated `app.module.ts` to include NotificationsModule
- Integrated with existing JWT authentication
- Uses existing Supabase connection

## Database Schema

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raffle_id INTEGER NOT NULL,
  user_address VARCHAR(56) NOT NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'email',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_raffle_user UNIQUE (raffle_id, user_address)
);
```

### Indexes
- `idx_notifications_raffle_id`: Fast lookup by raffle
- `idx_notifications_user_address`: Fast lookup by user
- `idx_notifications_created_at`: Ordered by creation time

## API Endpoints

### POST /notifications/subscribe
Subscribe to raffle notifications

**Authentication**: Required (JWT Bearer token)

**Request Body**:
```json
{
  "raffleId": 123,
  "channel": "email"
}
```

**Response** (201 Created):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "raffle_id": 123,
  "user_address": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "channel": "email",
  "created_at": "2024-02-25T10:30:00.000Z"
}
```

**Error Responses**:
- `401 Unauthorized`: Missing or invalid JWT token
- `409 Conflict`: Already subscribed to this raffle
- `400 Bad Request`: Invalid request body

### DELETE /notifications/subscribe/:raffleId
Unsubscribe from raffle notifications

**Authentication**: Required (JWT Bearer token)

**Parameters**:
- `raffleId`: Raffle ID (integer)

**Response** (204 No Content): Empty body

**Error Responses**:
- `401 Unauthorized`: Missing or invalid JWT token

### GET /notifications/subscriptions
Get all user subscriptions

**Authentication**: Required (JWT Bearer token)

**Response** (200 OK):
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "raffle_id": 123,
    "user_address": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "channel": "email",
    "created_at": "2024-02-25T10:30:00.000Z"
  },
  {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "raffle_id": 456,
    "user_address": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "channel": "push",
    "created_at": "2024-02-25T11:00:00.000Z"
  }
]
```

**Error Responses**:
- `401 Unauthorized`: Missing or invalid JWT token

## Authentication

All endpoints require JWT authentication:
- Token must be provided in `Authorization: Bearer <token>` header
- Token is validated by `JwtAuthGuard` (global guard)
- User address is extracted from JWT payload via `@CurrentUser('address')` decorator
- Tokens are issued by the `/auth/verify` endpoint after SIWS verification

## File Structure

```
backend/
├── database/
│   └── migrations/
│       └── 002_notifications.sql              # Database migration
├── src/
│   ├── api/
│   │   └── rest/
│   │       └── notifications/
│   │           ├── dto/
│   │           │   ├── subscribe.dto.ts       # Request validation
│   │           │   └── index.ts
│   │           ├── notifications.controller.ts # HTTP endpoints
│   │           ├── notifications.service.ts    # Business logic
│   │           └── notifications.module.ts     # Module config
│   ├── services/
│   │   └── notification.service.ts            # Supabase integration
│   └── app.module.ts                          # Updated with NotificationsModule
```

## Setup Instructions

### 1. Run Database Migration

Execute the migration in Supabase SQL Editor:

```bash
# Copy the contents of backend/database/migrations/002_notifications.sql
# Paste into Supabase SQL Editor and run
```

Or use the Supabase CLI:

```bash
supabase db push
```

### 2. Environment Variables

Ensure these variables are set in `.env`:

```env
# Supabase (already configured)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# JWT (already configured)
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=7d
```

### 3. Install Dependencies

Dependencies are already installed (NestJS, Supabase client):

```bash
cd backend
npm install
```

### 4. Start the Server

```bash
npm run dev
```

The notification endpoints will be available at:
- `http://localhost:3001/notifications/subscribe`
- `http://localhost:3001/notifications/subscribe/:raffleId`
- `http://localhost:3001/notifications/subscriptions`

## Testing

### Manual Testing with cURL

1. **Get JWT Token** (sign in first):
```bash
# Get nonce
curl http://localhost:3001/auth/nonce?address=YOUR_ADDRESS

# Sign message with wallet and verify
curl -X POST http://localhost:3001/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "address": "YOUR_ADDRESS",
    "signature": "YOUR_SIGNATURE",
    "nonce": "NONCE_FROM_STEP_1"
  }'

# Save the accessToken from response
```

2. **Subscribe to Raffle**:
```bash
curl -X POST http://localhost:3001/notifications/subscribe \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "raffleId": 1,
    "channel": "email"
  }'
```

3. **Get Subscriptions**:
```bash
curl http://localhost:3001/notifications/subscriptions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

4. **Unsubscribe**:
```bash
curl -X DELETE http://localhost:3001/notifications/subscribe/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Testing Checklist

- [ ] Run database migration
- [ ] Start backend server
- [ ] Authenticate and get JWT token
- [ ] Subscribe to a raffle
- [ ] Verify subscription in database
- [ ] Get user subscriptions
- [ ] Try subscribing again (should return existing)
- [ ] Unsubscribe from raffle
- [ ] Verify subscription removed
- [ ] Test without authentication (should fail)
- [ ] Test with invalid raffle ID
- [ ] Test with invalid channel

## Integration with Frontend

The backend endpoints match the frontend expectations:

| Frontend Call | Backend Endpoint |
|--------------|------------------|
| `subscribeToRaffle()` | `POST /notifications/subscribe` |
| `unsubscribeFromRaffle()` | `DELETE /notifications/subscribe/:raffleId` |
| `getUserSubscriptions()` | `GET /notifications/subscriptions` |

Response formats match the TypeScript interfaces defined in the frontend.

## Notification Delivery (Future)

The notification system is ready for delivery implementation:

### Email Notifications

```typescript
// Example: Send email when raffle ends
async function notifyRaffleEnd(raffleId: number) {
  const subscribers = await notificationService.getRaffleSubscribers(raffleId);
  
  for (const sub of subscribers) {
    if (sub.channel === 'email') {
      await emailService.send({
        to: sub.user_address, // or lookup email from user profile
        subject: `Raffle #${raffleId} has ended!`,
        template: 'raffle-ended',
        data: { raffleId }
      });
    }
  }
}
```

### Push Notifications

```typescript
// Example: Send push notification when user wins
async function notifyWinner(raffleId: number, winnerAddress: string) {
  const subscription = await notificationService.getSubscription(
    raffleId,
    winnerAddress
  );
  
  if (subscription?.channel === 'push') {
    await pushService.send({
      to: winnerAddress,
      title: 'Congratulations!',
      body: `You won raffle #${raffleId}!`,
      data: { raffleId }
    });
  }
}
```

## Event Triggers

Notifications should be triggered by:

1. **Raffle End Event**
   - Listen for raffle finalization on blockchain
   - Get all subscribers for the raffle
   - Send "raffle ended" notifications

2. **Winner Selected Event**
   - Listen for winner selection on blockchain
   - Check if winner is subscribed
   - Send "you won" notification

3. **Implementation Options**
   - Blockchain event listener (indexer)
   - Scheduled job checking raffle status
   - Webhook from contract/oracle

## Security Considerations

1. **Authentication**: All endpoints require valid JWT
2. **Authorization**: Users can only manage their own subscriptions
3. **Rate Limiting**: Protected by global throttler guard
4. **Input Validation**: DTOs validate all request data
5. **SQL Injection**: Protected by Supabase parameterized queries
6. **Unique Constraint**: Prevents duplicate subscriptions

## Performance

- **Indexes**: Optimized for common queries
- **Supabase**: Handles connection pooling
- **Caching**: Can add Redis for frequently accessed data
- **Batch Operations**: Can implement bulk subscribe/unsubscribe

## Monitoring

Recommended monitoring:

1. **Subscription Metrics**
   - Total subscriptions
   - Subscriptions per raffle
   - Active users with subscriptions

2. **API Metrics**
   - Request rate
   - Error rate
   - Response time

3. **Delivery Metrics** (future)
   - Notifications sent
   - Delivery success rate
   - Bounce rate

## Future Enhancements

- [ ] Email service integration (SendGrid, AWS SES)
- [ ] Push notification service (Firebase, OneSignal)
- [ ] SMS notifications (Twilio)
- [ ] Discord/Telegram webhooks
- [ ] Notification preferences (frequency, types)
- [ ] Notification history/log
- [ ] Batch operations
- [ ] Notification templates
- [ ] A/B testing for notifications
- [ ] Analytics and reporting

## Troubleshooting

### Subscription not created
- Check JWT token is valid
- Verify raffle_id exists
- Check Supabase connection
- Review server logs

### Duplicate subscription error
- This is expected behavior
- Frontend should handle gracefully
- Returns existing subscription

### Cannot delete subscription
- Verify user owns the subscription
- Check raffle_id is correct
- Ensure JWT token matches subscription owner

## Related Documentation

- Frontend: `client/docs/NOTIFICATIONS.md`
- Frontend Implementation: `client/NOTIFICATION_IMPLEMENTATION.md`
- Database Schema: `backend/database/migrations/002_notifications.sql`
- API Reference: This document

## Support

For issues or questions:
1. Check server logs: `npm run dev`
2. Verify database migration ran successfully
3. Test endpoints with cURL
4. Review Supabase dashboard for data
