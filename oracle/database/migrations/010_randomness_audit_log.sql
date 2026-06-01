-- Randomness decision audit trail: reconstructable draw processing history

CREATE TABLE IF NOT EXISTS randomness_audit_log (
  id                  BIGSERIAL      PRIMARY KEY,
  request_id          TEXT           NOT NULL,
  stable_request_id   TEXT,
  contract_event_id   TEXT,
  queue_job_id        TEXT,
  raffle_id           INTEGER        NOT NULL,
  request_input       JSONB          NOT NULL,
  provider            TEXT           CHECK (provider IN ('vrf', 'prng')),
  proof_metadata      JSONB,
  submission_tx_hash  TEXT,
  submission_ledger   INTEGER,
  status              TEXT           NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  error_message       TEXT,
  created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_randomness_audit_log_request_id
  ON randomness_audit_log (request_id);

CREATE INDEX IF NOT EXISTS idx_randomness_audit_log_contract_event_id
  ON randomness_audit_log (contract_event_id);

CREATE INDEX IF NOT EXISTS idx_randomness_audit_log_queue_job_id
  ON randomness_audit_log (queue_job_id);

CREATE INDEX IF NOT EXISTS idx_randomness_audit_log_raffle_id
  ON randomness_audit_log (raffle_id);

ALTER TABLE randomness_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'randomness_audit_log'
        AND policyname = 'public_select'
    ) THEN
        CREATE POLICY "public_select" ON randomness_audit_log FOR SELECT USING (true);
    END IF;
END $$;
