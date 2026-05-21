-- Add completed_at column to live_orders for tracking when orders were completed
ALTER TABLE live_orders
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Add updated_at column if it doesn't exist (for tracking status changes)
ALTER TABLE live_orders
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
