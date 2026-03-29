# Notification Subscription UI Implementation

## Summary

Successfully implemented the notification subscription feature for the Tikka raffle platform. Users can now subscribe to receive notifications when a raffle ends or when they win.

## What Was Implemented

### 1. Core Service Layer
- **`notificationService.ts`**: API client for notification endpoints
  - Subscribe to raffle notifications
  - Unsubscribe from notifications
  - Get user subscriptions
  - Check subscription status

### 2. React Hook
- **`useNotifications.ts`**: Custom hook for managing subscriptions
  - Manages subscription state
  - Handles authentication requirements
  - Auto-checks subscription status
  - Provides subscribe/unsubscribe methods

### 3. UI Components

#### NotificationSubscribeButton
- Full-featured subscribe/unsubscribe button
- Shows loading states and success/error messages
- Handles authentication flow
- Available in default and compact variants
- Used on raffle detail pages

#### NotificationBellIcon
- Compact bell icon for raffle cards
- Quick toggle for subscriptions
- Visual indication of subscription status
- Minimal UI footprint

#### NotificationPreferences
- Complete subscription management panel
- Lists all active subscriptions
- Allows individual unsubscribe
- Shows subscription details (date, channel)

### 4. Pages

#### Settings Page
- New `/settings` route
- Tabbed interface (Notifications, Profile)
- Full notification preferences management
- Profile information display

### 5. Integration Points

#### RaffleDetails Page
- Added notification subscription section
- "Stay Updated" card with subscribe button
- Prompts authentication when needed

#### App.tsx
- Added Settings route
- Integrated with existing routing structure

### 6. Configuration
- Updated `api.ts` with notification endpoints
- Added notification types to `types.ts`
- Configured API client for authenticated requests

## File Structure

```
client/
├── src/
│   ├── components/
│   │   ├── NotificationSubscribeButton.tsx       # Main subscribe button
│   │   ├── NotificationPreferences.tsx           # Settings panel
│   │   └── cards/
│   │       └── NotificationBellIcon.tsx          # Compact bell icon
│   ├── hooks/
│   │   └── useNotifications.ts                   # Subscription hook
│   ├── services/
│   │   └── notificationService.ts                # API client
│   ├── pages/
│   │   ├── Settings.tsx                          # Settings page
│   │   └── RaffleDetails.tsx                     # Updated with notifications
│   ├── config/
│   │   └── api.ts                                # Updated with endpoints
│   └── types/
│       └── types.ts                              # Updated with notification types
└── docs/
    └── NOTIFICATIONS.md                          # Feature documentation
```

## API Endpoints Required

The backend must implement these endpoints:

### POST /notifications/subscribe
Subscribe to raffle notifications
```typescript
Request:
  Headers: Authorization: Bearer <JWT>
  Body: { raffleId: number, channel?: 'email' | 'push' }

Response:
  Status: 201 Created
  Body: {
    id: string,
    raffleId: number,
    userAddress: string,
    channel: string,
    createdAt: string
  }
```

### DELETE /notifications/subscribe/:raffleId
Unsubscribe from raffle notifications
```typescript
Request:
  Headers: Authorization: Bearer <JWT>
  Params: raffleId (number)

Response:
  Status: 204 No Content
```

### GET /notifications/subscriptions
Get all user subscriptions
```typescript
Request:
  Headers: Authorization: Bearer <JWT>

Response:
  Status: 200 OK
  Body: [{
    id: string,
    raffleId: number,
    channel: string,
    createdAt: string
  }]
```

## User Flow

### 1. On Raffle Detail Page
1. User views raffle details
2. Sees "Stay Updated" section with "Notify Me" button
3. If not signed in, clicking prompts authentication
4. If signed in, clicking subscribes to notifications
5. Button updates to show "Unsubscribe" status
6. Success message displays briefly

### 2. In Settings
1. User navigates to `/settings`
2. Clicks "Notifications" tab
3. Views all active subscriptions
4. Can unsubscribe from individual raffles
5. Sees subscription details (date, channel)

### 3. On Raffle Cards (Optional)
1. Compact bell icon can be added to raffle cards
2. Quick toggle without leaving the page
3. Visual indication of subscription status

## Authentication Requirements

All notification features require:
- User must be signed in with Stellar wallet
- Valid JWT token in sessionStorage
- Token automatically included in API requests
- Auto-logout on wallet disconnect

## Notification Channels

Currently supported:
- **Email** (default): Email notifications
- **Push** (future): Browser push notifications

## Error Handling

The implementation handles:
- Authentication required errors
- Network failures
- Subscription conflicts
- Token expiration
- API errors

All errors display user-friendly messages with dismiss options.

## Testing Checklist

- [ ] Sign in with wallet
- [ ] Subscribe to raffle from detail page
- [ ] Verify subscription status updates
- [ ] Navigate to Settings → Notifications
- [ ] View active subscriptions
- [ ] Unsubscribe from a raffle
- [ ] Verify subscription removed
- [ ] Test without authentication
- [ ] Test error scenarios

## Next Steps for Backend

1. **Create Notifications Table**
   ```sql
   CREATE TABLE notifications (
     id UUID PRIMARY KEY,
     raffle_id INTEGER NOT NULL,
     user_address VARCHAR(56) NOT NULL,
     channel VARCHAR(20) NOT NULL,
     created_at TIMESTAMP DEFAULT NOW(),
     UNIQUE(raffle_id, user_address)
   );
   ```

2. **Implement API Endpoints**
   - POST /notifications/subscribe
   - DELETE /notifications/subscribe/:raffleId
   - GET /notifications/subscriptions

3. **Add Authentication Middleware**
   - Verify JWT tokens
   - Extract user address
   - Protect endpoints

4. **Implement Notification Delivery**
   - Email service integration
   - Event triggers on raffle end
   - Event triggers on win

## Future Enhancements

- Push notification support
- Email preferences (frequency, types)
- Notification history
- Batch operations
- SMS notifications
- Discord/Telegram integration
- Notification templates

## Documentation

See `client/docs/NOTIFICATIONS.md` for detailed usage documentation and examples.

## Notes

- All components follow existing Tikka design patterns
- Uses existing authentication system
- Integrates seamlessly with current routing
- Minimal dependencies (uses existing lucide-react icons)
- Responsive design for mobile and desktop
- Accessible UI with proper ARIA labels
