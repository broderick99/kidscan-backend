-- Migration: Add seeking_helper fields to homes table
-- 
-- This migration adds two columns to track when homeowners need help finding a teen:
-- 1. seeking_helper: Boolean flag indicating if the homeowner is seeking help
-- 2. seeking_helper_requested_at: Timestamp of when help was requested
--
-- To run this migration manually:
-- psql -h localhost -p 5432 -U postgres -d kidscan_dev -f manual-migration-seeking-helper.sql

-- Add seeking_helper field to homes table to track when homeowners need help finding a teen
ALTER TABLE homes 
ADD COLUMN seeking_helper BOOLEAN DEFAULT FALSE,
ADD COLUMN seeking_helper_requested_at TIMESTAMP;

-- Add index for finding homes that need helpers
CREATE INDEX idx_homes_seeking_helper ON homes(seeking_helper) WHERE seeking_helper = TRUE;

-- Verify the migration
SELECT 
    'Migration completed successfully!' as status,
    count(*) as columns_added
FROM information_schema.columns 
WHERE table_name = 'homes' 
AND column_name IN ('seeking_helper', 'seeking_helper_requested_at');