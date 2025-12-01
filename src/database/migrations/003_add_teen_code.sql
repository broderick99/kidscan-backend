-- Add teen_code column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS teen_code VARCHAR(5) UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_teen_code ON profiles(teen_code) WHERE teen_code IS NOT NULL;

-- Generate codes for existing teens
-- This will be handled by the application to ensure uniqueness