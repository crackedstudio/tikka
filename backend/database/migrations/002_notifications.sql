-- notifications: user subscriptions for raffle alerts
-- Users can subscribe to be notified when a raffle ends or when they win
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raffle_id INTEGER NOT NULL,
  user_address VARCHAR(56) NOT NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'email',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_raffle_user UNIQUE (raffle_id, user_address)
);

CREATE INDEX IF NOT EXISTS idx_notifications_raffle_id ON notifications(raffle_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_address ON notifications(user_address);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- RLS: users can only read/write their own subscriptions
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Backend uses service_role key which bypasses RLS
-- For future: add policies for authenticated users to manage their own subscriptions

COMMENT ON TABLE notifications IS 'User subscriptions for raffle notifications (end/win alerts)';
COMMENT ON COLUMN notifications.raffle_id IS 'Raffle ID from contract/indexer';
COMMENT ON COLUMN notifications.user_address IS 'Stellar wallet address of subscriber';
COMMENT ON COLUMN notifications.channel IS 'Notification channel: email or push';
