-- Migration: Create audit_chain_anchors table
--
-- This table stores point-in-time snapshots of the audit log chain head.
-- Each anchor records the chain_hash of the last record so that operators
-- can verify that the chain has not been retroactively rewritten.
--
-- Apply:  psql -f create-audit-chain-anchors.sql
-- Rollback:  DROP TABLE IF EXISTS audit_chain_anchors;
--
-- See docs/RANDOMNESS_SCHEME.md §6 for the full tamper-evident design.

CREATE TABLE IF NOT EXISTS audit_chain_anchors (
    id              BIGSERIAL PRIMARY KEY,
    chain_head_hash TEXT        NOT NULL,
    record_count    INTEGER     NOT NULL,
    anchored_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    anchor_type     TEXT        NOT NULL DEFAULT 'cli',
    external_ref    TEXT
);

COMMENT ON TABLE  audit_chain_anchors IS 'Point-in-time snapshots of the audit log chain head for tamper evidence';
COMMENT ON COLUMN audit_chain_anchors.chain_head_hash IS 'chain_hash of the most recent vrf_audit_log record at anchor time';
COMMENT ON COLUMN audit_chain_anchors.record_count IS 'total number of vrf_audit_log records when anchor was created';
COMMENT ON COLUMN audit_chain_anchors.anchored_at IS 'when the anchor was created';
COMMENT ON COLUMN audit_chain_anchors.anchor_type IS 'label describing who/what created the anchor (cli, scheduled-cron, api, etc.)';
COMMENT ON COLUMN audit_chain_anchors.external_ref IS 'optional URL, tx hash, or identifier where the hash was published externally';

-- Index for ordering by most recent anchor
CREATE INDEX IF NOT EXISTS idx_audit_chain_anchors_anchored_at
    ON audit_chain_anchors (anchored_at DESC);