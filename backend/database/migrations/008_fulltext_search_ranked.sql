-- Migration 008: Full-text search RPC with ts_rank ordering and category filter
-- Depends on: 007_search_optimization.sql (search_vector column + GIN index)

-- Drop existing function if it exists (idempotent)
DROP FUNCTION IF EXISTS search_raffles_ranked(text, text, integer, integer);

-- Returns raffle_metadata rows ranked by ts_rank descending.
-- Parameters:
--   search_query  : websearch_to_tsquery compatible string (e.g. "gaming prize")
--   p_category    : optional category filter (NULL = no filter)
--   p_limit       : max rows to return
--   p_offset      : pagination offset
CREATE OR REPLACE FUNCTION search_raffles_ranked(
  search_query text,
  p_category   text    DEFAULT NULL,
  p_limit      integer DEFAULT 20,
  p_offset     integer DEFAULT 0
)
RETURNS TABLE (
  raffle_id    integer,
  title        text,
  description  text,
  image_url    text,
  image_urls   text[],
  category     text,
  metadata_cid text,
  created_at   timestamptz,
  updated_at   timestamptz,
  rank         real,
  total_count  bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH matched AS (
    SELECT
      m.*,
      ts_rank(m.search_vector, websearch_to_tsquery('english', search_query)) AS rank
    FROM raffle_metadata m
    WHERE
      m.search_vector @@ websearch_to_tsquery('english', search_query)
      AND (p_category IS NULL OR m.category = p_category)
  ),
  counted AS (
    SELECT COUNT(*) AS total_count FROM matched
  )
  SELECT
    matched.raffle_id,
    matched.title,
    matched.description,
    matched.image_url,
    matched.image_urls,
    matched.category,
    matched.metadata_cid,
    matched.created_at,
    matched.updated_at,
    matched.rank,
    counted.total_count
  FROM matched, counted
  ORDER BY matched.rank DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- Grant execute to anon and authenticated roles (Supabase default roles)
GRANT EXECUTE ON FUNCTION search_raffles_ranked(text, text, integer, integer) TO anon, authenticated;
