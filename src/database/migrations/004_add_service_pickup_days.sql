-- Add table to store multiple pickup days per service
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
COMMENT ON COLUMN service_pickup_days.can_number IS 'Identifies which can (1, 2, or 3) for multi-can plans';