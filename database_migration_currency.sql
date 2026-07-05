-- Add currency configuration columns to restaurants table
-- Default: India (INR, en-IN)

ALTER TABLE public.restaurants
ADD COLUMN IF NOT EXISTS country_code text DEFAULT 'IN',
ADD COLUMN IF NOT EXISTS currency_code text DEFAULT 'INR',
ADD COLUMN IF NOT EXISTS currency_symbol text DEFAULT '\u20B9',
ADD COLUMN IF NOT EXISTS locale text DEFAULT 'en-IN';
