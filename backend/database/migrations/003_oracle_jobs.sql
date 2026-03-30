-- oracle_jobs: tracks oracle job lifecycle for admin observability
-- All access via service_role key from backend (no public read policy)
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS oracle_jobs (
  id            TEXT        PRIMARY KEY,
  status        TEXT        NOT NULL
                CHECK (status IN ('pending', 'completed', 'failed')),
  enqueued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at  TIMESTAMPTZ,
  latency_ms    INTEGER,
  xdr           TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_oracle_jobs_status      ON oracle_jobs(status);
CREATE INDEX IF NOT EXISTS idx_oracle_jobs_enqueued_at ON oracle_jobs(enqueued_at DESC);
CREATE INDEX IF NOT EXISTS idx_oracle_jobs_updated_at  ON oracle_jobs(updated_at DESC);

ALTER TABLE oracle_jobs ENABLE ROW LEVEL SECURITY;
-- No public read policy; all access via service_role key from backend

COMMENT ON TABLE oracle_jobs IS 'Oracle job lifecycle records for admin dashboard observability';
COMMENT ON COLUMN oracle_jobs.id IS 'UUID or oracle-assigned job ID';
COMMENT ON COLUMN oracle_jobs.status IS 'Job status: pending | completed | failed';
COMMENT ON COLUMN oracle_jobs.enqueued_at IS 'Timestamp when job was enqueued';
COMMENT ON COLUMN oracle_jobs.updated_at IS 'Timestamp of last status update';
COMMENT ON COLUMN oracle_jobs.confirmed_at IS 'Timestamp when job completed (status = completed)';
COMMENT ON COLUMN oracle_jobs.latency_ms IS 'Milliseconds from enqueued_at to confirmed_at';
COMMENT ON COLUMN oracle_jobs.xdr IS 'Raw XDR payload (populated for failed jobs)';
COMMENT ON COLUMN oracle_jobs.error_message IS 'Error description (populated for failed jobs)';
