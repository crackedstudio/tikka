# Notifications Lifecycle

The notifications system handles user subscriptions for events (like raffle ending, user winning) across multiple channels (push, email).

## Subscription Model

Subscriptions are tracked in the `notifications` and `notification_subscriptions` (normalized) tables with the following key attributes:
- `user_address`: The Stellar wallet address of the user.
- `device_token`: For push channels, the device registration token.
- `channel`: 'email' or 'push'.
- `event_preferences`: JSON indicating which events the user wishes to receive.
- `status`: 'active', 'inactive', or 'revoked'.

## API Endpoints

### 1. Create a Subscription
`POST /notifications/subscribe`
Registers a user for a raffle notification. If the subscription already exists, it is returned without error (idempotent).
**Status**: 201 Created / 200 OK

### 2. Update a Subscription
`PUT /notifications/:id`
Updates an existing subscription (e.g., changing the channel).
**Status**: 200 OK

### 3. Unsubscribe
`DELETE /notifications/subscribe/:raffleId`
Marks a subscription as `revoked` (soft delete) so we can maintain history without sending further notifications.
**Status**: 204 No Content

### 4. Device Tokens
`POST /notifications/device-token` registers a FCM token.
`DELETE /notifications/device-token` removes it.

## Stale Token Cleanup
When Firebase Cloud Messaging returns errors indicating a token is no longer registered (`messaging/registration-token-not-registered`), the `PushNotificationService` automatically cleans up those stale tokens from the database.
