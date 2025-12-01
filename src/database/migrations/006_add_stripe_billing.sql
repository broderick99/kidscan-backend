-- Add Stripe billing columns to support payment integration

-- Add Stripe customer ID to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255) UNIQUE;

-- Add billing fields to homes table
ALTER TABLE homes ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);
ALTER TABLE homes ADD COLUMN IF NOT EXISTS stripe_subscription_item_id VARCHAR(255);
ALTER TABLE homes ADD COLUMN IF NOT EXISTS billing_status VARCHAR(50) DEFAULT 'setup_required';

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_homes_billing_status ON homes(billing_status);
CREATE INDEX IF NOT EXISTS idx_homes_subscription ON homes(stripe_subscription_id);

-- Add billing status check constraint
ALTER TABLE homes ADD CONSTRAINT chk_billing_status 
CHECK (billing_status IN ('setup_required', 'active', 'past_due', 'canceled', 'suspended'));