-- Migration: Add support for multiple images in raffle metadata
-- Date: 2026-03-28

-- Add image_urls column to store array of image URLs
ALTER TABLE raffle_metadata 
ADD COLUMN IF NOT EXISTS image_urls TEXT[];

-- Add comment to explain the column
COMMENT ON COLUMN raffle_metadata.image_urls IS 'Array of image URLs for raffles with multiple prize images (e.g., physical items from different angles)';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_raffle_metadata_image_urls ON raffle_metadata USING GIN (image_urls);

-- Note: The existing image_url column is kept for backward compatibility
-- New raffles should populate both image_url (primary image) and image_urls (all images)
