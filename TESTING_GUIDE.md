# Notification Feature Testing Guide

## Prerequisites

### Backend Setup
1. Ensure Supabase is configured with environment variables:
   ```env
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

2. Run database migrations:
   ```bash
   # In Supabase SQL Editor, run:
   backend/database/migrations/002_notifications.sql
   ```

3. Start backend server:
   ```bash
   cd backend
   npm install
   npm run start:dev
   ```

### Frontend Setup
1. Configure environment variables:
   ```env
   VITE_API_BASE_URL=http://localhost:3001
   ```

2. Start frontend development server:
   ```bash
   cd client
   npm install
   npm run dev
   ```

## Test Scenarios

### 1. Authentication Flow

#### Test 1.1: Unauthenticated User
**Steps:**
1. Open browser to `http://localhost:5173`
2. Navigate to any raffle detail page
3. Locate the "Stay Updated" section
4. Click "Notify Me" button

**Expected Result:**
- Alert message: "Please sign in to subscribe to notifications"
- User is not subscribed
- Button remains in "Notify Me" state

#### Test 1.2: Sign In Flow
**Steps:**
1. Click "Sign In" button in navbar
2. Connect Stellar wallet (Freighter/xBull)
3. Sign the authentication message
4. Verify JWT token is stored in sessionStorage

**Expected Result:**
- User is authenticated
- Token stored as `tikka_auth_token` in sessionStorage
- "Sign In" button changes to show wallet address

### 2. Subscribe to Notifications

#### Test 2.1: First-time Subscription
**Steps:**
1. Ensure user is authenticated
2. Navigate to raffle detail page (e.g., `/details?raffle=1`)
3. Click "Notify Me" button in "Stay Updated" section

**Expected Result:**
- Button shows loading spinner briefly
- Success message: "Subscribed successfully!"
- Button changes to "Unsubscribe" with gray background
- Bell icon changes to filled state

**API Call Verification:**
```bash
# Check network tab for:
POST http://localhost:3001/notifications/subscribe
Headers: Authorization: Bearer <JWT>
Body: { "raffleId": 1, "channel": "email" }
Response: { "id": "uuid", "raffleId": 1, "userAddress": "G...", "channel": "email", "createdAt": "2024-..." }
```

#### Test 2.2: Duplicate Subscription
**Steps:**
1. Subscribe to a raffle (as in Test 2.1)
2. Click "Unsubscribe" then "Notify Me" again

**Expected Result:**
- Backend returns existing subscription (no error)
- Frontend shows success message
- Subscription status updates correctly

#### Test 2.3: Multiple Raffle Subscriptions
**Steps:**
1. Subscribe to raffle #1
2. Navigate to raffle #2
3. Subscribe to raffle #2
4. Navigate to raffle #3
5. Subscribe to raffle #3

**Expected Result:**
- Each subscription succeeds independently
- All subscriptions are tracked separately
- No conflicts between subscriptions

### 3. Unsubscribe from Notifications

#### Test 3.1: Unsubscribe from Detail Page
**Steps:**
1. Subscribe to a raffle
2. Click "Unsubscribe" button

**Expected Result:**
- Button shows loading spinner briefly
- Success message: "Unsubscribed successfully!"
- Button changes back to "Notify Me" with gradient background
- Bell icon changes to outline state

**API Call Verification:**
```bash
# Check network tab for:
DELETE http://localhost:3001/notifications/subscribe/1
Headers: Authorization: Bearer <JWT>
Response: 204 No Content
```

#### Test 3.2: Unsubscribe from Settings
**Steps:**
1. Subscribe to multiple raffles
2. Navigate to `/settings`
3. Click "Notifications" tab
4. Click trash icon next to a subscription

**Expected Result:**
- Subscription shows loading spinner on trash icon
- Subscription is removed from list
- Other subscriptions remain intact
- If last subscription, shows empty state

### 4. Settings Page

#### Test 4.1: View Subscriptions
**Steps:**
1. Subscribe to 2-3 raffles
2. Navigate to `/settings`
3. View "Notifications" tab

**Expected Result:**
- All active subscriptions are listed
- Each shows:
  - Raffle ID
  - Channel (email/push)
  - Subscription date
  - Unsubscribe button
- Subscriptions ordered by date (newest first)

**API Call Verification:**
```bash
# Check network tab for:
GET http://localhost:3001/notifications/subscriptions
Headers: Authorization: Bearer <JWT>
Response: [
  { "id": "uuid1", "raffleId": 1, "channel": "email", "createdAt": "..." },
  { "id": "uuid2", "raffleId": 2, "channel": "email", "createdAt": "..." }
]
```

#### Test 4.2: Empty State
**Steps:**
1. Ensure no active subscriptions
2. Navigate to `/settings`
3. View "Notifications" tab

**Expected Result:**
- Bell icon displayed
- Message: "No active subscriptions"
- Helpful text about subscribing to raffles

#### Test 4.3: Profile Tab
**Steps:**
1. Navigate to `/settings`
2. Click "Profile" tab

**Expected Result:**
- Shows wallet address
- Displays informational message about profile features

### 5. Navigation

#### Test 5.1: Settings Link in Navbar
**Steps:**
1. Check desktop navbar
2. Check mobile navbar (hamburger menu)

**Expected Result:**
- "Settings" link visible in both views
- Clicking navigates to `/settings`
- Link highlights when on settings page

### 6. Error Handling

#### Test 6.1: Network Error
**Steps:**
1. Stop backend server
2. Try to subscribe to a raffle

**Expected Result:**
- Error message displayed
- Button returns to original state
- User can dismiss error
- No subscription created

#### Test 6.2: Token Expiration
**Steps:**
1. Manually expire or clear JWT token
2. Try to subscribe to a raffle

**Expected Result:**
- 401 error from backend
- Token cleared from sessionStorage
- Error message: "Unauthorized - please sign in again"
- User prompted to sign in again

#### Test 6.3: Invalid Raffle ID
**Steps:**
1. Try to subscribe to non-existent raffle (e.g., raffle ID 99999)

**Expected Result:**
- Backend may accept subscription (no validation)
- Or returns error if raffle validation exists
- Error displayed to user if applicable

### 7. UI/UX Testing

#### Test 7.1: Loading States
**Steps:**
1. Observe all loading states during operations

**Expected Result:**
- Subscribe button shows spinner during API call
- Unsubscribe button shows spinner during API call
- Settings page shows spinner while loading subscriptions
- Trash icon shows spinner during unsubscribe

#### Test 7.2: Success Feedback
**Steps:**
1. Subscribe to a raffle
2. Unsubscribe from a raffle

**Expected Result:**
- Success messages appear briefly (2 seconds)
- Messages are clearly visible
- Messages auto-dismiss
- Visual feedback on button state changes

#### Test 7.3: Responsive Design
**Steps:**
1. Test on desktop (1920x1080)
2. Test on tablet (768x1024)
3. Test on mobile (375x667)

**Expected Result:**
- All components render correctly
- Buttons are appropriately sized
- Text is readable
- No layout breaks
- Touch targets are adequate on mobile

### 8. Integration Testing

#### Test 8.1: End-to-End Flow
**Steps:**
1. Start as unauthenticated user
2. Browse raffles
3. Sign in with wallet
4. Subscribe to 3 different raffles
5. Navigate to settings
6. Verify all 3 subscriptions appear
7. Unsubscribe from 1 raffle
8. Navigate back to that raffle detail
9. Verify "Notify Me" button is shown
10. Navigate to another subscribed raffle
11. Verify "Unsubscribe" button is shown

**Expected Result:**
- All steps complete successfully
- State is consistent across pages
- No errors in console
- API calls are correct

#### Test 8.2: Subscription Persistence
**Steps:**
1. Subscribe to a raffle
2. Refresh the page
3. Check subscription status

**Expected Result:**
- Subscription status persists after refresh
- Button shows correct state ("Unsubscribe")
- Settings page shows subscription

#### Test 8.3: Multi-tab Consistency
**Steps:**
1. Open app in two browser tabs
2. Subscribe in tab 1
3. Refresh tab 2
4. Check subscription status in tab 2

**Expected Result:**
- Tab 2 shows updated subscription status
- Both tabs show consistent state

## Database Verification

### Check Subscriptions in Supabase
```sql
-- View all subscriptions
SELECT * FROM notifications ORDER BY created_at DESC;

-- View subscriptions for specific user
SELECT * FROM notifications 
WHERE user_address = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
ORDER BY created_at DESC;

-- View subscriptions for specific raffle
SELECT * FROM notifications 
WHERE raffle_id = 1;

-- Count subscriptions per raffle
SELECT raffle_id, COUNT(*) as subscriber_count 
FROM notifications 
GROUP BY raffle_id 
ORDER BY subscriber_count DESC;
```

## API Testing with cURL

### Subscribe to Raffle
```bash
curl -X POST http://localhost:3001/notifications/subscribe \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"raffleId": 1, "channel": "email"}'
```

### Unsubscribe from Raffle
```bash
curl -X DELETE http://localhost:3001/notifications/subscribe/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get User Subscriptions
```bash
curl -X GET http://localhost:3001/notifications/subscriptions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Performance Testing

### Test 9.1: Multiple Rapid Subscriptions
**Steps:**
1. Quickly subscribe/unsubscribe multiple times

**Expected Result:**
- All requests complete successfully
- No race conditions
- Final state is consistent
- No duplicate subscriptions

### Test 9.2: Large Subscription List
**Steps:**
1. Create 20+ subscriptions
2. Load settings page

**Expected Result:**
- Page loads within 2 seconds
- All subscriptions render correctly
- Scrolling is smooth
- No performance degradation

## Security Testing

### Test 10.1: Unauthorized Access
**Steps:**
1. Remove JWT token from sessionStorage
2. Try to access API endpoints directly

**Expected Result:**
- All requests return 401 Unauthorized
- No data is exposed
- User is prompted to sign in

### Test 10.2: Token Validation
**Steps:**
1. Use invalid/expired JWT token
2. Try to subscribe to raffle

**Expected Result:**
- Backend rejects request
- 401 error returned
- Token cleared from storage

### Test 10.3: Cross-User Access
**Steps:**
1. Sign in as User A
2. Subscribe to raffles
3. Sign out and sign in as User B
4. Check subscriptions

**Expected Result:**
- User B only sees their own subscriptions
- User A's subscriptions are not visible
- No data leakage between users

## Browser Compatibility

Test on:
- ✅ Chrome (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Edge (latest)
- ✅ Mobile Safari (iOS)
- ✅ Chrome Mobile (Android)

## Known Issues / Edge Cases

1. **Raffle Deletion**: If a raffle is deleted, subscriptions remain in database
   - Consider cleanup job or cascade delete

2. **Email Validation**: No email validation currently
   - Users subscribe but may not receive emails if no email on file

3. **Push Notifications**: UI supports push channel but delivery not implemented
   - Backend accepts "push" but doesn't send notifications

4. **Notification Delivery**: Subscription works but actual notification sending not implemented
   - Need email service integration
   - Need raffle end event triggers

## Success Criteria

All tests should pass with:
- ✅ No console errors
- ✅ Correct API responses
- ✅ Proper state management
- ✅ Good user experience
- ✅ Responsive design
- ✅ Secure authentication
- ✅ Data persistence
- ✅ Error handling

## Reporting Issues

When reporting issues, include:
1. Test scenario number
2. Steps to reproduce
3. Expected vs actual result
4. Browser and version
5. Console errors (if any)
6. Network tab screenshots
7. Database state (if relevant)
