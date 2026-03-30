-- push_tokens: device tokens for push notifications (FCM)
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS push_tokens (
  user_address TEXT NOT NULL,
  device_token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'fcm',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_address, device_token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_address ON push_tokens(user_address);
CREATE INDEX IF NOT EXISTS idx_push_tokens_device_token ON push_tokens(device_token);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
-- No public read policy; all access performed by backend service_role key.

COMMENT ON TABLE push_tokens IS 'FCM/OneSignal device tokens mapped to user wallet addresses';
COMMENT ON COLUMN push_tokens.user_address IS 'Stellar wallet address of device owner';
COMMENT ON COLUMN push_tokens.device_token IS 'Push provider device registration token';
COMMENT ON COLUMN push_tokens.platform IS 'Push provider, e.g. fcm';
COMMENT ON COLUMN push_tokens.created_at IS 'Creation timestamp';
COMMENT ON COLUMN push_tokens.updated_at IS 'Last update timestamp';
