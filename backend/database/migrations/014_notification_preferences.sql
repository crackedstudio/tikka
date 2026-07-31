-- 014_notification_preferences.sql
-- User notification preferences: opt-in/out settings for notification types
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_address VARCHAR(56) PRIMARY KEY,
  raffle_end BOOLEAN NOT NULL DEFAULT true,
  win_notification BOOLEAN NOT NULL DEFAULT true,
  channel VARCHAR(20) NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'push')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_address ON notification_preferences(user_address);

-- RLS: users can only read/write their own preferences
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Backend uses service_role key which bypasses RLS
-- For future: add policies for authenticated users to manage their own preferences

COMMENT ON TABLE notification_preferences IS 'User notification preferences for opt-in/out control';
COMMENT ON COLUMN notification_preferences.user_address IS 'Stellar wallet address of user';
COMMENT ON COLUMN notification_preferences.raffle_end IS 'Opt-in for raffle end notifications';
COMMENT ON COLUMN notification_preferences.win_notification IS 'Opt-in for win notifications';
COMMENT ON COLUMN notification_preferences.channel IS 'Preferred notification channel: email or push';
