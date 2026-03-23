-- Track the gap between homeowner invoice settlement and teen Stripe Connect payout.
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS stripe_invoice_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS invoice_settled_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS stripe_transfer_id VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS stripe_transfer_group VARCHAR(255),
ADD COLUMN IF NOT EXISTS stripe_source_transaction_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS transfer_attempt_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS transfer_attempted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS transfer_next_retry_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS transfer_failure_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_payout_retry
ON payments(type, status, transfer_next_retry_at)
WHERE type = 'task_completion' AND stripe_transfer_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_payments_invoice_settlement
ON payments(stripe_invoice_id, invoice_settled_at)
WHERE stripe_invoice_id IS NOT NULL;
