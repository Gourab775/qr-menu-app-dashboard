-- Add completed_at column to live_orders for tracking when orders were completed
ALTER TABLE live_orders
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Add updated_at column if it doesn't exist (for tracking status changes)
ALTER TABLE live_orders
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Ensure status column has a default of 'pending' (in case table was created without it)
ALTER TABLE live_orders
ALTER COLUMN status SET DEFAULT 'pending';

-- Backfill any rows where status is NULL or empty
UPDATE live_orders SET status = 'pending' WHERE status IS NULL OR status = '';
