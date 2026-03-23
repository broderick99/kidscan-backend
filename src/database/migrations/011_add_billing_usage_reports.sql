-- Durable usage report ledger for Stripe metered billing
CREATE TABLE IF NOT EXISTS billing_usage_reports (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
    payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
    service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    home_id INTEGER NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    homeowner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    usage_value DECIMAL(10,2) NOT NULL,
    occurred_at TIMESTAMP NOT NULL,
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    stripe_meter_id VARCHAR(255),
    stripe_event_identifier VARCHAR(255) NOT NULL UNIQUE,
    stripe_event_name VARCHAR(255) NOT NULL DEFAULT 'can_completed',
    stripe_value_key VARCHAR(255) NOT NULL DEFAULT 'value',
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    retry_count INTEGER NOT NULL DEFAULT 0,
    attempted_at TIMESTAMP,
    reported_at TIMESTAMP,
    next_retry_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_error TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_billing_usage_report_status
      CHECK (status IN ('pending', 'processing', 'reported', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_billing_usage_reports_status_retry
ON billing_usage_reports(status, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_billing_usage_reports_home
ON billing_usage_reports(home_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_billing_usage_reports_payment
ON billing_usage_reports(payment_id);
