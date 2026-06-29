/**
 * Oracle Jobs Durability Migration
 * 
 * Adds persistent storage for oracle job state to survive process restarts.
 * This enables automatic job recovery on startup without losing in-progress randomness jobs.
 */

-- Create oracle_jobs table for durable job state tracking
CREATE TABLE IF NOT EXISTS oracle_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_id VARCHAR(255) NOT NULL UNIQUE,
  raffle_id BIGINT NOT NULL,
  state VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB,
  
  -- Indexes for efficient queries
  CONSTRAINT oracle_jobs_state_check CHECK (state IN (
    'QUEUED',
    'GENERATING',
    'COMMITTING',
    'REVEALING',
    'COMPLETED',
    'FAILED',
    'CANCELLED'
  ))
);

-- Index for finding jobs by state (for recovery on startup)
CREATE INDEX IF NOT EXISTS idx_oracle_jobs_state ON oracle_jobs(state);

-- Index for finding jobs by raffle
CREATE INDEX IF NOT EXISTS idx_oracle_jobs_raffle_id ON oracle_jobs(raffle_id);

-- Index for efficient updated_at queries (for cleanup)
CREATE INDEX IF NOT EXISTS idx_oracle_jobs_updated_at ON oracle_jobs(updated_at);

-- Update trigger to automatically set updated_at
CREATE OR REPLACE FUNCTION update_oracle_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS oracle_jobs_updated_at_trigger ON oracle_jobs;
CREATE TRIGGER oracle_jobs_updated_at_trigger
BEFORE UPDATE ON oracle_jobs
FOR EACH ROW
EXECUTE FUNCTION update_oracle_jobs_updated_at();
