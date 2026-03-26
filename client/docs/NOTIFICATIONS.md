# Notification Subscription Feature

## Overview

The notification subscription feature allows users to subscribe to raffle alerts and receive notifications when:
- A raffle they're interested in ends
- They win a raffle they've entered

## Architecture

### Frontend Components

#### Services
- **`notificationService.ts`**: API client for notification endpoints
  - `subscribeToRaffle()`: Subscribe to a raffle
  - `unsubscribeFromRaffle()`: Unsubscribe from a raffle
  - `getUserSubscriptions()`: Get all user subscriptions
  - `isSubscribedToRaffle()`: Check subscription status

#### Hooks
- **`useNotifications.ts`**: React hook for managing subscriptions
  - Provides subscription state and methods
  - Handles authentication requirements
  - Auto-checks subscription status on mount

#### Components
- **`NotificationSubscribeButton.tsx`**: Full-featured subscribe/unsubscribe button
  - Shows subscription status
  - Handles authentication flow
  - Displays success/error messages
  - Available in default and compact variants

- **`NotificationBellIcon.tsx`**: Compact bell icon for raffle cards
  - Quick toggle for subscriptions
  - Visual indication of subscription status
  - Minimal UI footprint

- **`NotificationPreferences.tsx`**: Settings panel for managing subscriptions
  - Lists all active subscriptions
  - Allows bulk management
  - Shows subscription details

#### Pages
- **`Settings.tsx`**: User settings page with notification preferences tab
  - Tabbed interface (Notifications, Profile)
  - Full subscription management
  - Profile information display

### API Endpoints

The frontend expects the following backend endpoints:

```typescript
POST /notifications/subscribe
Body: { raffleId: number, channel?: 'email' | 'push' }
Headers: Authorization: Bearer <JWT>
Response: { id: string, raffleId: number, userAddress: string, channel: string, createdAt: string }

DELETE /notifications/subscribe/:raffleId
Headers: Authorization: Bearer <JWT>
Response: 204 No Content

GET /notifications/subscriptions
Headers: Authorization: Bearer <JWT>
Response: [{ id: string, raffleId: number, channel: string, createdAt: string }]
```

## Usage

### On Raffle Detail Page

```tsx
import NotificationSubscribeButton from '../components/NotificationSubscribeButton';

<NotificationSubscribeButton
  raffleId={raffle.id}
  onAuthRequired={() => {
    // Handle authentication requirement
    alert('Please sign in to subscribe');
  }}
/>
```

### On Raffle Cards (Compact)

```tsx
import NotificationBellIcon from '../components/cards/NotificationBellIcon';

<NotificationBellIcon
  raffleId={raffle.id}
  onAuthRequired={() => {
    // Handle authentication requirement
  }}
/>
```

### In Settings Page

```tsx
import NotificationPreferences from '../components/NotificationPreferences';

<NotificationPreferences />
```

### Using the Hook Directly

```tsx
import { useNotifications } from '../hooks/useNotifications';

function MyComponent({ raffleId }) {
  const {
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
    clearError
  } = useNotifications(raffleId);

  const handleSubscribe = async () => {
    try {
      await subscribe(raffleId, 'email');
      console.log('Subscribed successfully!');
    } catch (err) {
      console.error('Subscription failed:', err);
    }
  };

  return (
    <button onClick={handleSubscribe} disabled={isLoading}>
      {isSubscribed ? 'Unsubscribe' : 'Subscribe'}
    </button>
  );
}
```

## Configuration

Add the API base URL to your `.env` file:

```env
VITE_API_BASE_URL=http://localhost:3001
```

The notification endpoints are configured in `client/src/config/api.ts`:

```typescript
notifications: {
  subscribe: '/notifications/subscribe',
  unsubscribe: (raffleId: string) => `/notifications/subscribe/${raffleId}`,
  list: '/notifications/subscriptions',
}
```

## Authentication

All notification endpoints require authentication via JWT token. The token is:
- Stored in `sessionStorage` as `tikka_auth_token`
- Automatically included in API requests via `apiClient.ts`
- Managed by the `AuthProvider` context

Users must be signed in with their Stellar wallet to:
- Subscribe to notifications
- View their subscriptions
- Manage notification preferences

## User Flow

1. **Unauthenticated User**
   - Sees "Notify Me" button on raffle details
   - Clicking prompts sign-in requirement
   - After signing in, can subscribe

2. **Authenticated User**
   - Sees subscription status on raffle details
   - Can toggle subscription with one click
   - Receives immediate feedback on success/error
   - Can manage all subscriptions in Settings

3. **Settings Management**
   - Navigate to `/settings`
   - View all active subscriptions
   - Unsubscribe from individual raffles
   - See subscription details (date, channel)

## Notification Channels

Currently supported channels:
- **Email**: Default channel for notifications
- **Push**: Browser push notifications (future enhancement)

The channel can be specified when subscribing:

```typescript
await subscribe(raffleId, 'email'); // or 'push'
```

## Error Handling

The notification system handles various error scenarios:

- **Authentication Required**: Prompts user to sign in
- **Network Errors**: Displays error message with retry option
- **Subscription Conflicts**: Handles duplicate subscriptions gracefully
- **Token Expiration**: Auto-clears token and prompts re-authentication

## Backend Requirements

The backend must implement:

1. **Notifications Table** (see ARCHITECTURE.md)
   - Store user subscriptions
   - Link to raffle IDs and user addresses
   - Track notification channels

2. **Authentication Middleware**
   - Verify JWT tokens
   - Extract user address from token
   - Protect notification endpoints

3. **Notification Delivery**
   - Email service integration
   - Push notification service (optional)
   - Event triggers on raffle end/win

4. **Subscription Management**
   - Create subscriptions
   - Delete subscriptions
   - List user subscriptions
   - Prevent duplicate subscriptions

## Testing

To test the notification feature:

1. **Sign in** with your Stellar wallet
2. **Navigate** to a raffle detail page
3. **Click** "Notify Me" button
4. **Verify** subscription status changes
5. **Go to** Settings → Notifications
6. **View** your active subscriptions
7. **Unsubscribe** from a raffle
8. **Verify** subscription is removed

## Future Enhancements

- [ ] Push notification support
- [ ] Email notification preferences (frequency, types)
- [ ] Notification history/log
- [ ] Batch subscribe/unsubscribe
- [ ] Notification templates customization
- [ ] SMS notifications
- [ ] Discord/Telegram integration
- [ ] Notification scheduling preferences

## Troubleshooting

### Subscription not working
- Verify you're signed in
- Check JWT token in sessionStorage
- Verify backend API is running
- Check browser console for errors

### Subscription status not updating
- Refresh the page
- Check network tab for API responses
- Verify backend returns correct data

### Can't see subscriptions in Settings
- Ensure you're authenticated
- Check API endpoint configuration
- Verify backend returns user subscriptions

## Related Files

- `client/src/services/notificationService.ts`
- `client/src/hooks/useNotifications.ts`
- `client/src/components/NotificationSubscribeButton.tsx`
- `client/src/components/NotificationBellIcon.tsx`
- `client/src/components/NotificationPreferences.tsx`
- `client/src/pages/Settings.tsx`
- `client/src/config/api.ts`
- `client/src/types/types.ts`
