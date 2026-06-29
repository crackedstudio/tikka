-- Migration 014: Atomic webhook failure count increment
-- Fixes race condition in webhook failure handling by using server-side atomic increment

-- Create function to atomically increment webhook failure count and conditionally disable
-- This ensures that concurrent deliveries both see the post-increment value
-- and that the webhook is disabled only when failure_count + 1 >= MAX_FAILURES
CREATE OR REPLACE FUNCTION increment_webhook_failure_count(
  p_webhook_id UUID,
  p_max_failures INT DEFAULT 5
)
RETURNS TABLE(failure_count INT, is_active BOOLEAN) AS $$
BEGIN
  -- RACE CONDITION FIX: This atomic UPDATE ensures that all concurrent failures
  -- read the post-increment value, not a stale pre-increment value.
  -- The logic is:
  --   1. failure_count is incremented at the database level (server-side)
  --   2. is_active is conditionally set to false in the SAME statement
  --   3. Both values are returned in one round-trip
  -- This closes the race window where multiple concurrent requests could:
  --   a) All read failure_count = N (stale)
  --   b) All compute N+1 and write N+1 (overwriting each other)
  --   c) Never trigger the disable condition if N+1 < MAX_FAILURES
  RETURN QUERY
  UPDATE webhooks
  SET
    failure_count = failure_count + 1,
    -- Disable atomically in the same statement — a separate UPDATE would reintroduce the race window
    is_active = CASE 
      WHEN (failure_count + 1) >= p_max_failures THEN false 
      ELSE is_active 
    END
  WHERE id = p_webhook_id
  RETURNING webhooks.failure_count, webhooks.is_active;
END;
$$ LANGUAGE plpgsql STRICT;

-- Create index to support fast webhook lookups during failure handling
CREATE INDEX IF NOT EXISTS idx_webhooks_id_active 
ON public.webhooks(id, is_active);
