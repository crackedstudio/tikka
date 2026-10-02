-- Observed inclusion fee for randomness submissions.
-- NULL means the fee was not recorded. Older rows may still store 0 because
-- confirmation polling hardcoded feePaid to 0; the audit CLI marks both as historical.

ALTER TABLE vrf_audit_log ADD COLUMN IF NOT EXISTS fee_stroops BIGINT;

COMMENT ON COLUMN vrf_audit_log.fee_stroops IS
  'Observed inclusion fee in stroops. NULL or 0 means historical/unrecorded (fee was previously hardcoded to 0).';
