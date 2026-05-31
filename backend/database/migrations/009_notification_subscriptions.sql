-- 009_notification_subscriptions.sql
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS notification_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL,
  device_token TEXT NOT NULL,
  channel TEXT NOT NULL,
  event_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('active','inactive','revoked')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Ensure a user doesn't have duplicate active subscriptions for the same device and channel
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_subscriptions_address_token_channel
  ON notification_subscriptions(address, device_token, channel);

ALTER TABLE notification_subscriptions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE notification_subscriptions IS 'Normalized notification subscriptions by user, device, and channel';
