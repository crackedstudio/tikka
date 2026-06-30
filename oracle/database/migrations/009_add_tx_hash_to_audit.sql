-- Add tx_hash field to vrf_audit_log for tracking on-chain submission

ALTER TABLE vrf_audit_log ADD COLUMN IF NOT EXISTS tx_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_vrf_audit_log_tx_hash ON vrf_audit_log (tx_hash) WHERE tx_hash IS NOT NULL;

COMMENT ON COLUMN vrf_audit_log.tx_hash IS 'Transaction hash of the on-chain randomness submission';
