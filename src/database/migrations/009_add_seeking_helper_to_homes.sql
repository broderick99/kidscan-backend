-- Add seeking_helper field to homes table to track when homeowners need help finding a teen
ALTER TABLE homes 
ADD COLUMN seeking_helper BOOLEAN DEFAULT FALSE,
ADD COLUMN seeking_helper_requested_at TIMESTAMP;

-- Add index for finding homes that need helpers
CREATE INDEX idx_homes_seeking_helper ON homes(seeking_helper) WHERE seeking_helper = TRUE;