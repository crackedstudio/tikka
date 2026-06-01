-- notification_retry_jobs: Track retry attempts for failed FCM deliveries
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS notification_retry_jobs (
  id BIGSERIAL PRIMARY KEY,
  user_address TEXT NOT NULL,
  device_token TEXT NOT NULL,
  payload JSONB NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_message TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, failed
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_retry_jobs_user_address ON notification_retry_jobs(user_address);
CREATE INDEX IF NOT EXISTS idx_notification_retry_jobs_status ON notification_retry_jobs(status);
CREATE INDEX IF NOT EXISTS idx_notification_retry_jobs_next_retry_at ON notification_retry_jobs(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_notification_retry_jobs_created_at ON notification_retry_jobs(created_at);

ALTER TABLE notification_retry_jobs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE notification_retry_jobs IS 'Tracks retry attempts for failed FCM push notifications';
COMMENT ON COLUMN notification_retry_jobs.user_address IS 'Stellar wallet address of notification recipient';
COMMENT ON COLUMN notification_retry_jobs.device_token IS 'FCM device token that failed';
COMMENT ON COLUMN notification_retry_jobs.payload IS 'Original notification payload (title, body, data)';
COMMENT ON COLUMN notification_retry_jobs.attempt_count IS 'Number of retry attempts made so far';
COMMENT ON COLUMN notification_retry_jobs.max_attempts IS 'Maximum number of retry attempts allowed';
COMMENT ON COLUMN notification_retry_jobs.next_retry_at IS 'Timestamp when next retry should be attempted';
COMMENT ON COLUMN notification_retry_jobs.last_error_code IS 'FCM error code from last failed attempt';
COMMENT ON COLUMN notification_retry_jobs.last_error_message IS 'FCM error message from last failed attempt';
COMMENT ON COLUMN notification_retry_jobs.status IS 'Job status: pending, completed, or failed';
COMMENT ON COLUMN notification_retry_jobs.created_at IS 'When the retry job was created';
COMMENT ON COLUMN notification_retry_jobs.updated_at IS 'When the retry job was last updated';
