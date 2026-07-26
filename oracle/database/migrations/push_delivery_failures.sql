-- push_delivery_failures: persistent record of failed push deliveries so
-- operators can identify undelivered notification classes after the fact.

CREATE TABLE push_delivery_failures (
  id             BIGSERIAL    PRIMARY KEY,
  user_address   TEXT         NOT NULL,
  device_token   TEXT,                      -- NULL for whole-batch provider outages
  error_code     TEXT         NOT NULL,
  classification TEXT         NOT NULL CHECK (
                   classification IN (
                     'transient_retry',
                     'permanent_invalid_token',
                     'permanent_other',
                     'provider_outage'
                   )
                 ),
  next_action    TEXT         NOT NULL CHECK (next_action IN ('retry', 'remove_token', 'drop')),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_failures_created_at     ON push_delivery_failures (created_at DESC);
CREATE INDEX idx_push_failures_classification ON push_delivery_failures (classification, created_at DESC);
CREATE INDEX idx_push_failures_user           ON push_delivery_failures (user_address, created_at DESC);

ALTER TABLE push_delivery_failures ENABLE ROW LEVEL SECURITY;