-- Create database if not exists
-- Note: Run this separately as superuser if needed:
-- CREATE DATABASE kidscan;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('teen', 'homeowner', 'admin')),
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    date_of_birth DATE,
    avatar_url TEXT,
    bio TEXT,
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Homes table
CREATE TABLE IF NOT EXISTS homes (
    id SERIAL PRIMARY KEY,
    homeowner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(50) NOT NULL,
    zip_code VARCHAR(10) NOT NULL,
    special_instructions TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Services table
CREATE TABLE IF NOT EXISTS services (
    id SERIAL PRIMARY KEY,
    teen_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    home_id INTEGER REFERENCES homes(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    frequency VARCHAR(50) NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'onetime')),
    price_per_task DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
    start_date DATE NOT NULL,
    end_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
    scheduled_date DATE NOT NULL,
    completed_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'missed', 'cancelled')),
    photo_url TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    teen_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('task_completion', 'bonus', 'referral', 'adjustment')),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    description TEXT,
    reference_id INTEGER,
    reference_type VARCHAR(50),
    processed_at TIMESTAMP,
    failure_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Earnings table (summary table, can be calculated from payments)
CREATE TABLE IF NOT EXISTS earnings (
    id SERIAL PRIMARY KEY,
    teen_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_earned DECIMAL(10,2) DEFAULT 0,
    total_paid DECIMAL(10,2) DEFAULT 0,
    pending_amount DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(teen_id, period_start, period_end)
);

-- Referrals table
CREATE TABLE IF NOT EXISTS referrals (
    id SERIAL PRIMARY KEY,
    referrer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    referred_email VARCHAR(255) NOT NULL,
    referred_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'registered', 'completed', 'expired')),
    reward_amount DECIMAL(10,2),
    completed_at TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Refresh tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_homes_homeowner_id ON homes(homeowner_id);
CREATE INDEX idx_services_teen_id ON services(teen_id);
CREATE INDEX idx_services_home_id ON services(home_id);
CREATE INDEX idx_tasks_service_id ON tasks(service_id);
CREATE INDEX idx_tasks_scheduled_date ON tasks(scheduled_date);
CREATE INDEX idx_payments_teen_id ON payments(teen_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX idx_referrals_referred_email ON referrals(referred_email);

-- Create update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update timestamp trigger to all tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_homes_updated_at BEFORE UPDATE ON homes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_earnings_updated_at BEFORE UPDATE ON earnings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_referrals_updated_at BEFORE UPDATE ON referrals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();-- Add teen_code column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS teen_code VARCHAR(5) UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_teen_code ON profiles(teen_code) WHERE teen_code IS NOT NULL;

-- Generate codes for existing teens
-- This will be handled by the application to ensure uniqueness-- Add table to store multiple pickup days per service
CREATE TABLE IF NOT EXISTS service_pickup_days (
    id SERIAL PRIMARY KEY,
    service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    day_of_week VARCHAR(20) NOT NULL CHECK (day_of_week IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
    can_number INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(service_id, can_number)
);

-- Create index for better performance
CREATE INDEX idx_service_pickup_days_service_id ON service_pickup_days(service_id);

-- Apply update timestamp trigger
CREATE TRIGGER update_service_pickup_days_updated_at BEFORE UPDATE ON service_pickup_days
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comment to explain the table
COMMENT ON TABLE service_pickup_days IS 'Stores multiple pickup days per service for multi-can plans';
COMMENT ON COLUMN service_pickup_days.can_number IS 'Identifies which can (1, 2, or 3) for multi-can plans';-- Add price_per_task column to tasks table
-- This allows tasks to store their pricing at creation time rather than always referencing the service's current price

-- Add the column
ALTER TABLE tasks ADD COLUMN price_per_task DECIMAL(10,2);

-- Backfill existing tasks with their current service pricing
-- This ensures existing tasks maintain their current pricing behavior
UPDATE tasks t 
SET price_per_task = s.price_per_task
FROM services s 
WHERE t.service_id = s.id 
AND t.price_per_task IS NULL;

-- Add NOT NULL constraint after backfilling
ALTER TABLE tasks ALTER COLUMN price_per_task SET NOT NULL;

-- Add index for performance on pricing queries
CREATE INDEX idx_tasks_price_per_task ON tasks(price_per_task);-- Add Stripe billing columns to support payment integration

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
CHECK (billing_status IN ('setup_required', 'active', 'past_due', 'canceled', 'suspended'));-- Magic links table for passwordless authentication
CREATE TABLE IF NOT EXISTS magic_links (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    mode VARCHAR(20) NOT NULL CHECK (mode IN ('signin', 'signup')),
    user_data JSONB, -- Stores additional data for signup (firstName, lastName, role, etc)
    used BOOLEAN DEFAULT false,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups
CREATE INDEX idx_magic_links_token ON magic_links(token);
CREATE INDEX idx_magic_links_email ON magic_links(email);

-- Cleanup old expired magic links periodically (can be run as a scheduled job)
-- DELETE FROM magic_links WHERE expires_at < CURRENT_TIMESTAMP;-- Add referred_by column to profiles table
ALTER TABLE profiles 
ADD COLUMN referred_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Add index for better performance
CREATE INDEX idx_profiles_referred_by ON profiles(referred_by);-- Add seeking_helper field to homes table to track when homeowners need help finding a teen
ALTER TABLE homes 
ADD COLUMN seeking_helper BOOLEAN DEFAULT FALSE,
ADD COLUMN seeking_helper_requested_at TIMESTAMP;

-- Add index for finding homes that need helpers
CREATE INDEX idx_homes_seeking_helper ON homes(seeking_helper) WHERE seeking_helper = TRUE;