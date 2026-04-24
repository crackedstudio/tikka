# Search Optimization Strategy

To optimize full-text search for raffles, we have implemented PostgreSQL GIN (Generalized Inverted Index) indexes on the `raffle_metadata` table.

## Implementation Details

### 1. tsvector Column
We added a generated column `search_vector` of type `tsvector`. This column automatically aggregates and tokenizes text from the following columns:
- `title` (Weight A - Highest priority)
- `description` (Weight B)
- `category` (Weight C - Lowest priority)

The `english` dictionary is used for stemming (e.g., "raffles" matches "raffle").

### 2. GIN Index
A GIN index `idx_raffle_metadata_search_vector` was created on the `search_vector` column. Unlike B-tree indexes, GIN indexes are designed for composite values (like document vectors) and allow for very fast full-text searching.

### 3. Querying
The backend was updated to use the `@@` operator (via Supabase's `.textSearch()`) instead of the expensive `ilike %pattern%` operator. We use the `websearch` type to support advanced search syntax:
- `"exact phrase"`
- `word1 -word2` (exclude word2)
- `word1 OR word2`

## Performance Analysis
To verify performance improvements, run the following in the database console:

```sql
EXPLAIN ANALYZE 
SELECT * 
FROM raffle_metadata 
WHERE search_vector @@ websearch_to_tsquery('english', 'your search query');
```

Expected results:
- **Index Scan** instead of **Sequential Scan**.
- Significant reduction in execution time as the number of raffles grows.
