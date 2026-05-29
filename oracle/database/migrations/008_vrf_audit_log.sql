-- VRF Audit Trail: persistent, tamper-detectable audit log for commit-reveal randomness
-- Requirements: 6.1, 6.2, 6.3

CREATE TABLE vrf_audit_log (
  id                BIGSERIAL    PRIMARY KEY,
  raffle_id         INTEGER      NOT NULL UNIQUE,
  request_id        TEXT,
  commitment_hash   TEXT         NOT NULL,
  reveal_hash       TEXT,
  proof             TEXT,
  seed              TEXT,
  oracle_public_key TEXT         NOT NULL,
  status            TEXT         NOT NULL CHECK (status IN ('committed', 'revealed', 'abandoned')),
  committed_at      TIMESTAMPTZ  NOT NULL,
  revealed_at       TIMESTAMPTZ,
  ledger_sequence   INTEGER,
  chain_hash        TEXT         NOT NULL
);

CREATE INDEX idx_vrf_audit_log_raffle_id    ON vrf_audit_log (raffle_id);
CREATE INDEX idx_vrf_audit_log_committed_at ON vrf_audit_log (committed_at DESC);

ALTER TABLE vrf_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_select" ON vrf_audit_log FOR SELECT USING (true);
