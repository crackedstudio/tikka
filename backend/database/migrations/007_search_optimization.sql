-- #169 Optimize search with PostgreSQL GIN indexes
-- Adds a generated tsvector column for full-text search across title, description, and category.
-- A GIN index is created on this column to optimize search performance.

-- 1. Add the search_vector column as a generated column
-- We use 'english' dictionary for stemming and setweight for ranking (Title > Description > Category)
ALTER TABLE raffle_metadata
ADD COLUMN IF NOT EXISTS search_vector tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(category, '')), 'C')
) STORED;

-- 2. Create the GIN index for efficient full-text search
CREATE INDEX IF NOT EXISTS idx_raffle_metadata_search_vector ON raffle_metadata USING GIN (search_vector);

-- 3. Analyze query performance (Manual step for DBA)
-- EXPLAIN ANALYZE SELECT * FROM raffle_metadata WHERE search_vector @@ websearch_to_tsquery('english', 'search terms');
