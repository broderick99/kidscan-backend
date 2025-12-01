-- Add referred_by column to profiles table
ALTER TABLE profiles 
ADD COLUMN referred_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Add index for better performance
CREATE INDEX idx_profiles_referred_by ON profiles(referred_by);