# Notification Preferences Implementation

## Summary

This implementation adds user notification preferences to the backend API, allowing users to control which types of notifications they receive and through which channel.

## Changes Made

### 1. Database Migration
- **File**: `backend/database/migrations/014_notification_preferences.sql`
- Created `notification_preferences` table with columns:
  - `user_address` (PRIMARY KEY)
  - `raffle_end` (BOOLEAN, default: true)
  - `win_notification` (BOOLEAN, default: true)
  - `channel` (VARCHAR, default: 'email', CHECK: 'email' or 'push')
  - `created_at`, `updated_at` timestamps

### 2. DTOs (Data Transfer Objects)
- **File**: `backend/src/api/rest/notifications/dto/notification-preferences.dto.ts`
- Created `NotificationPreferencesSchema` (Zod validation)
- Created `NotificationPreferencesDto` class
- Created `NotificationPreferencesResponse` interface

### 3. Service Layer Updates
- **File**: `backend/src/services/notification.service.ts`
- Added interfaces:
  - `NotificationPreferences`
  - `UpdatePreferencesPayload`
- Added methods:
  - `getPreferences(userAddress)`: Get user preferences (returns defaults if not set)
  - `updatePreferences(userAddress, payload)`: Update or create preferences
  - `canSendRaffleEnd(userAddress)`: Check opt-in for raffle end notifications
  - `canSendWinner(userAddress)`: Check opt-in for win notifications
  - `getRaffleEndSubscribers(raffleId)`: Get filtered subscribers for raffle end
  - `getWinnerSubscribers(raffleId)`: Get filtered subscribers for winner notifications

### 4. API Service Layer
- **File**: `backend/src/api/rest/notifications/notifications.service.ts`
- Added imports for preference types
- Added method `toPreferencesResponse()`: Transform DB format to API format
- Added method `getPreferences()`: Get user preferences
- Added method `updatePreferences()`: Update user preferences

### 5. Controller Endpoints
- **File**: `backend/src/api/rest/notifications/notifications.controller.ts`
- Added `GET /notifications/preferences`: Get authenticated user's preferences
- Added `PUT /notifications/preferences`: Update authenticated user's preferences
- Both endpoints require JWT authentication

### 6. Tests
Created comprehensive test suites:

- **File**: `backend/src/api/rest/notifications/notifications-preferences.spec.ts`
  - Tests for GET endpoint (default and custom preferences)
  - Tests for PUT endpoint (full and partial updates)

- **File**: `backend/src/services/notification-preferences.service.spec.ts`
  - Tests for `getPreferences()` (existing, defaults, errors)
  - Tests for `updatePreferences()` (full, partial, errors)
  - Tests for `canSendRaffleEnd()` and `canSendWinner()`
  - Tests for subscriber filtering methods

### 7. Documentation
- **File**: `backend/docs/NOTIFICATION_PREFERENCES.md`
  - Complete feature documentation
  - API endpoint specifications
  - Usage examples
  - Migration instructions

- **File**: `backend/docs/NOTIFICATION_PREFERENCES_INTEGRATION.md`
  - Integration guide for developers
  - Example implementations for raffle end and winner notifications
  - Event processor integration example
  - Performance optimization strategies
  - Testing guidelines

## API Endpoints

### GET /notifications/preferences
- **Auth**: Required (JWT Bearer)
- **Response**: User's notification preferences
- **Default**: If not set, returns `{ raffleEnd: true, winNotification: true, channel: 'email' }`

### PUT /notifications/preferences
- **Auth**: Required (JWT Bearer)
- **Body**: `{ raffleEnd?: boolean, winNotification?: boolean, channel?: 'email' | 'push' }`
- **Response**: Updated preferences
- **Behavior**: Creates or updates preferences (upsert)

## Usage

### Client Example
```typescript
// Get preferences
const prefs = await fetch('/notifications/preferences', {
  headers: { Authorization: `Bearer ${token}` }
});

// Update preferences
await fetch('/notifications/preferences', {
  method: 'PUT',
  headers: { 
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  },
  body: JSON.stringify({ raffleEnd: false })
});
```

### Backend Integration
```typescript
// Use preference-aware methods when sending notifications
const subscribers = await notificationService.getRaffleEndSubscribers(raffleId);
// or
const subscribers = await notificationService.getWinnerSubscribers(raffleId);
```

## Acceptance Criteria

✅ **A user can retrieve their notification preferences**
- GET endpoint implemented
- Returns defaults when not set
- Authenticated with JWT

✅ **A user can update their notification preferences**
- PUT endpoint implemented
- Supports partial updates
- Creates row if doesn't exist (upsert)
- Authenticated with JWT

✅ **The notification service respects opt-out settings**
- `getRaffleEndSubscribers()` filters by `raffle_end` preference
- `getWinnerSubscribers()` filters by `win_notification` preference
- Helper methods `canSendRaffleEnd()` and `canSendWinner()` check individual users

✅ **Tests are written**
- 13 controller tests covering all endpoint scenarios
- 17 service tests covering all methods and edge cases
- Tests include success cases, error handling, and filtering logic

## Deployment Steps

1. **Run Migration**
   ```sql
   -- Execute in Supabase SQL Editor
   -- backend/database/migrations/014_notification_preferences.sql
   ```

2. **Deploy Backend Code**
   - All changes are backward compatible
   - Existing users are opted-in by default

3. **Update Notification Senders**
   - Replace `getRaffleSubscribers()` with:
     - `getRaffleEndSubscribers()` for raffle end notifications
     - `getWinnerSubscribers()` for winner notifications

4. **Update Frontend**
   - Add preferences UI using the new endpoints
   - Allow users to manage their notification settings

## Design Decisions

1. **Default Opt-In**: Users are opted-in by default to maintain backward compatibility
2. **User-Level Preferences**: Preferences are per user, not per device
3. **Separate Filtering Methods**: Created dedicated methods for clarity and type safety
4. **Upsert Pattern**: PUT endpoint creates or updates to simplify client logic
5. **Channel Preference**: Single channel preference (future enhancement: per-notification-type channels)

## Future Enhancements

- Batch preference loading for better performance with many subscribers
- Per-notification-type channel preferences
- Preference history/audit log
- Admin endpoints to view opt-out statistics
- Email template selection preference
- Notification frequency controls (immediate, daily digest, etc.)
