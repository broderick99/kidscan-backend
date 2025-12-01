-- Add price_per_task column to tasks table
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
CREATE INDEX idx_tasks_price_per_task ON tasks(price_per_task);