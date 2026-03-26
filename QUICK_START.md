# Notification Feature - Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### 1. Database Setup (1 minute)
```sql
-- Run in Supabase SQL Editor
-- File: backend/database/migrations/002_notifications.sql

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raffle_id INTEGER NOT NULL,
  user_address VARCHAR(56) NOT NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'email',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_raffle_user UNIQUE (raffle_id, user_address)
);

CREATE INDEX idx_notifications_raffle_id ON notifications(raffle_id);
CREATE INDEX idx_notifications_user_address ON notifications(user_address);
```

### 2. Environment Variables (1 minute)
```env
# Backend (.env)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Frontend (.env)
VITE_API_BASE_URL=http://localhost:3001
```

### 3. Start Servers (2 minutes)
```bash
# Terminal 1 - Backend
cd backend
npm install
npm run start:dev

# Terminal 2 - Frontend
cd client
npm install
npm run dev
```

### 4. Test the Feature (1 minute)
1. Open `http://localhost:5173`
2. Sign in with your Stellar wallet
3. Navigate to any raffle detail page
4. Click "Notify Me" button
5. Go to Settings → Notifications to see your subscription

## 📋 Quick Reference

### API Endpoints
```
POST   /notifications/subscribe          - Subscribe to raffle
DELETE /notifications/subscribe/:raffleId - Unsubscribe
GET    /notifications/subscriptions      - List subscriptions
```

### Key Components
```typescript
// Subscribe button on raffle detail
<NotificationSubscribeButton raffleId={raffle.id} />

// Compact bell icon for cards
<NotificationBellIcon raffleId={raffle.id} />

// Settings page preferences
<NotificationPreferences />

// Use the hook directly
const { isSubscribed, subscribe, unsubscribe } = useNotifications(raffleId);
```

### API Usage
```typescript
// Subscribe
await subscribeToRaffle({ raffleId: 1, channel: 'email' });

// Unsubscribe
await unsubscribeFromRaffle(1);

// Get subscriptions
const subs = await getUserSubscriptions();

// Check status
const subscribed = await isSubscribedToRaffle(1);
```

## 🧪 Quick Test

### Test Subscribe Flow
```bash
# 1. Get JWT token (sign in via UI and check sessionStorage)
TOKEN="your_jwt_token"

# 2. Subscribe to raffle
curl -X POST http://localhost:3001/notifications/subscribe \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"raffleId": 1, "channel": "email"}'

# 3. List subscriptions
curl -X GET http://localhost:3001/notifications/subscriptions \
  -H "Authorization: Bearer $TOKEN"

# 4. Unsubscribe
curl -X DELETE http://localhost:3001/notifications/subscribe/1 \
  -H "Authorization: Bearer $TOKEN"
```

## 📁 File Locations

### Frontend
```
client/src/
├── services/notificationService.ts      # API client
├── hooks/useNotifications.ts            # React hook
├── components/
│   ├── NotificationSubscribeButton.tsx  # Full button
│   ├── NotificationPreferences.tsx      # Settings panel
│   └── cards/NotificationBellIcon.tsx   # Compact icon
└── pages/Settings.tsx                   # Settings page
```

### Backend
```
backend/src/
├── api/rest/notifications/
│   ├── notifications.controller.ts      # REST endpoints
│   ├── notifications.service.ts         # API service
│   └── dto/subscribe.dto.ts            # Request validation
└── services/notification.service.ts     # Database operations
```

## 🔍 Troubleshooting

### Issue: "Cannot subscribe"
- ✅ Check JWT token in sessionStorage
- ✅ Verify backend is running
- ✅ Check database migration ran successfully

### Issue: "Subscriptions not showing"
- ✅ Verify user is authenticated
- ✅ Check API endpoint configuration
- ✅ Look for errors in browser console

### Issue: "401 Unauthorized"
- ✅ Sign in again to get fresh token
- ✅ Check token expiration
- ✅ Verify JWT secret matches between frontend/backend

## 📚 Full Documentation

- **Complete Guide**: `NOTIFICATION_FEATURE_COMPLETE.md`
- **Testing Guide**: `TESTING_GUIDE.md`
- **PR Description**: `PR_DESCRIPTION.md`
- **API Docs**: `client/docs/NOTIFICATIONS.md`

## ✅ Success Checklist

- [ ] Database migration applied
- [ ] Environment variables configured
- [ ] Backend server running
- [ ] Frontend server running
- [ ] Can sign in with wallet
- [ ] Can subscribe to raffle
- [ ] Can see subscription in Settings
- [ ] Can unsubscribe from raffle

## 🎉 You're Done!

The notification subscription feature is now fully functional. Users can:
- Subscribe to raffle notifications
- Manage subscriptions in Settings
- Receive notifications when raffles end (once delivery is implemented)

For detailed information, see the full documentation files.
