-- Migration Template
-- File: YYYYMMDD_HHMMSS_description.sql
-- 
-- This template shows the structure for database migrations.
-- Always include both UP and DOWN (rollback) procedures.

-- ============================================================================
-- UP: Apply the migration
-- ============================================================================

BEGIN;

-- Add your migration SQL here
-- Example:
-- ALTER TABLE raffles ADD COLUMN new_field VARCHAR(255);
-- CREATE INDEX idx_raffles_new_field ON raffles(new_field);

COMMIT;

-- ============================================================================
-- DOWN: Rollback the migration (for testing and emergency rollback)
-- ============================================================================
-- 
-- To rollback, run:
-- BEGIN;
-- [rollback SQL here]
-- COMMIT;
--
-- Example:
-- BEGIN;
-- DROP INDEX IF EXISTS idx_raffles_new_field;
-- ALTER TABLE raffles DROP COLUMN new_field;
-- COMMIT;

-- ============================================================================
-- Notes
-- ============================================================================
-- 
-- 1. Always wrap migrations in BEGIN/COMMIT for atomicity
-- 2. Test rollback locally before deploying
-- 3. Avoid long-running operations that lock tables
-- 4. For large tables, consider adding indexes after data migration
-- 5. Document any data transformations or backfills
-- 6. Include rollback procedure in comments for reference
