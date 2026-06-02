-- 011_refresh_token_families.sql
-- Adds token family tracking to refresh_tokens for reuse-detection and family revocation.
-- Run this in Supabase SQL Editor after 006_refresh_tokens.sql.

-- Add family_id column: groups all tokens issued from the same login session.
-- On reuse of a superseded token, the entire family is revoked.
ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS family_id TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id ON refresh_tokens(family_id);

COMMENT ON COLUMN refresh_tokens.family_id IS
  'UUID grouping all rotated tokens from a single login session. '
  'Reuse of a superseded token triggers revocation of the whole family.';
