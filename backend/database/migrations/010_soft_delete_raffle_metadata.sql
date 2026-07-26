-- 009_soft_delete_raffle_metadata: add soft-delete support to raffle_metadata
-- Adds deleted_at column; NULL means active, non-NULL means soft-deleted.
-- Run this in Supabase SQL Editor

ALTER TABLE raffle_metadata
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_raffle_metadata_deleted_at ON raffle_metadata(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Update the public read policy to exclude soft-deleted rows
DROP POLICY IF EXISTS "Allow public read" ON raffle_metadata;

CREATE POLICY "Allow public read"
  ON raffle_metadata FOR SELECT
  USING (deleted_at IS NULL);

COMMENT ON COLUMN raffle_metadata.deleted_at IS 'Soft-delete timestamp; NULL = active, non-NULL = archived/deleted';
