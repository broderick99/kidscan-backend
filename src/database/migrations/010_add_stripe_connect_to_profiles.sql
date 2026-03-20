-- Add Stripe Connect fields for teen payout onboarding
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS stripe_connect_account_id VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS stripe_connect_onboarding_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS stripe_connect_details_submitted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS stripe_connect_requirements_due JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS stripe_connect_requirements_past_due JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS stripe_connect_last_synced_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_connect_account_id
ON profiles(stripe_connect_account_id)
WHERE stripe_connect_account_id IS NOT NULL;
