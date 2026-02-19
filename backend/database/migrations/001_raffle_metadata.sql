-- raffle_metadata: off-chain metadata for raffles (title, description, image, category)
-- Keyed by raffle_id (matches on-chain raffle ID from contract/indexer)
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS raffle_metadata (
  raffle_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  category TEXT,
  metadata_cid TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raffle_metadata_category ON raffle_metadata(category);
CREATE INDEX IF NOT EXISTS idx_raffle_metadata_updated_at ON raffle_metadata(updated_at DESC);

-- RLS: allow public read; writes go through backend (service_role key bypasses RLS)
ALTER TABLE raffle_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read"
  ON raffle_metadata FOR SELECT
  USING (true);

-- Writes: backend uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.
-- For future auth: add INSERT/UPDATE policy for authenticated raffle creators.
