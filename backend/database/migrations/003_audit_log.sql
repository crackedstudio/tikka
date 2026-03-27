-- audit_log: off-chain transparency log for every oracle reveal result
-- Stores the seed, proof, and tx_hash for each randomness reveal so anyone
-- can independently verify on-chain randomness.
-- Retention: rows older than 1 year are pruned by a scheduled job.
-- Run this in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp     TIMESTAMP WITH TIME ZONE NOT NULL,
  raffle_id     INTEGER NOT NULL,
  request_id    TEXT NOT NULL,
  oracle_id     TEXT NOT NULL,
  seed          TEXT NOT NULL,
  proof         TEXT NOT NULL,
  tx_hash       TEXT NOT NULL,
  method        TEXT NOT NULL CHECK (method IN ('VRF', 'PRNG')),
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_audit_request UNIQUE (request_id)
);

CREATE INDEX IF NOT EXISTS idx_audit_log_raffle_id   ON audit_log(raffle_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp   ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_tx_hash     ON audit_log(tx_hash);

-- Public read; writes go through backend service role key (bypasses RLS).
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read"
  ON audit_log FOR SELECT
  USING (true);
