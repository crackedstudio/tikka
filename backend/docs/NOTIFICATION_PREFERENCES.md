# Notification Preferences

## Overview

User notification preferences allow users to control which types of notifications they receive and through which channel. This feature provides opt-in/opt-out control for:

- **Raffle End Notifications**: Alerts when a raffle ends
- **Win Notifications**: Alerts when a user wins a raffle
- **Channel Preference**: Email or push notifications

## Database Schema

### Table: `notification_preferences`

```sql
CREATE TABLE notification_preferences (
  user_address VARCHAR(56) PRIMARY KEY,
  raffle_end BOOLEAN NOT NULL DEFAULT true,
  win_notification BOOLEAN NOT NULL DEFAULT true,
  channel VARCHAR(20) NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'push')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Default Behavior**: When a user has no preferences set, they are opted-in to all notification types via email.

## API Endpoints

### GET /notifications/preferences

Retrieves the authenticated user's notification preferences.

**Authentication**: Required (JWT Bearer token)

**Response**:
```json
{
  "userAddress": "GTEST123456789...",
  "raffleEnd": true,
  "winNotification": true,
  "channel": "email",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

### PUT /notifications/preferences

Updates the authenticated user's notification preferences.

**Authentication**: Required (JWT Bearer token)

**Request Body** (all fields optional):
```json
{
  "raffleEnd": false,
  "winNotification": true,
  "channel": "push"
}
```

**Response**:
```json
{
  "userAddress": "GTEST123456789...",
  "raffleEnd": false,
  "winNotification": true,
  "channel": "push",
  "updatedAt": "2024-01-01T12:00:00Z"
}
```

## Implementation Details

### Service Layer

The `NotificationService` provides methods to check user preferences before sending notifications:

- `getPreferences(userAddress)`: Retrieve user preferences (returns defaults if not set)
- `updatePreferences(userAddress, payload)`: Update or create preferences
- `canSendRaffleEnd(userAddress)`: Check if user opted in for raffle end notifications
- `canSendWinner(userAddress)`: Check if user opted in for win notifications
- `getRaffleEndSubscribers(raffleId)`: Get subscribers filtered by raffle end preferences
- `getWinnerSubscribers(raffleId)`: Get subscribers filtered by win notification preferences

### Filtering Logic

When sending notifications, use the filtered subscriber methods:

```typescript
// For raffle end notifications
const subscribers = await notificationService.getRaffleEndSubscribers(raffleId);

// For winner notifications
const subscribers = await notificationService.getWinnerSubscribers(raffleId);
```

These methods automatically filter out users who have opted out of the respective notification types.

## Usage Example

### Client-side Integration

```typescript
// Get user preferences
const preferences = await fetch('/notifications/preferences', {
  headers: { Authorization: `Bearer ${token}` }
});

// Update preferences
await fetch('/notifications/preferences', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  },
  body: JSON.stringify({
    raffleEnd: false,
    winNotification: true,
    channel: 'push'
  })
});
```

### Backend Integration

When sending notifications, always use the preference-aware methods:

```typescript
// Before (sends to all subscribers)
const subscribers = await notificationService.getRaffleSubscribers(raffleId);

// After (respects user preferences)
const subscribers = await notificationService.getRaffleEndSubscribers(raffleId);
// or
const subscribers = await notificationService.getWinnerSubscribers(raffleId);
```

## Migration

Run migration `014_notification_preferences.sql` in Supabase to create the table.

## Testing

Tests are provided in:
- `backend/src/api/rest/notifications/notifications-preferences.spec.ts` - Controller tests
- `backend/src/services/notification-preferences.service.spec.ts` - Service layer tests

## Privacy & Compliance

- Users are opted-in by default to maintain backward compatibility
- Preferences are stored per user address (not per device)
- Users can opt out at any time via the API
- The system respects opt-out settings immediately for all future notifications
