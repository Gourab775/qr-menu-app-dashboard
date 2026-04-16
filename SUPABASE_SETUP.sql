-- Complete Supabase Setup SQL
-- Run this in Supabase Dashboard > SQL Editor

-- =====================================
-- PAYMENT_TOKENS TABLE
-- =====================================

-- Create the payment_tokens table if it doesn't exist
CREATE TABLE IF NOT EXISTS payment_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  token TEXT,
  amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE payment_tokens ENABLE ROW LEVEL SECURITY;

-- Create index for faster order lookups
CREATE INDEX IF NOT EXISTS idx_payment_tokens_order_id ON payment_tokens(order_id);

-- Policy: Allow public read access
DROP POLICY IF EXISTS "Anyone can select payment_tokens" ON payment_tokens;
CREATE POLICY "Anyone can select payment_tokens" ON payment_tokens
  FOR SELECT TO public USING (true);

-- Policy: Allow authenticated insert
DROP POLICY IF EXISTS "Users can insert payment_tokens" ON payment_tokens;
CREATE POLICY "Users can insert payment_tokens" ON payment_tokens
  FOR INSERT TO authenticated WITH CHECK (true);

-- Policy: Allow authenticated update
DROP POLICY IF EXISTS "Users can update payment_tokens" ON payment_tokens;
CREATE POLICY "Users can update payment_tokens" ON payment_tokens
  FOR UPDATE TO authenticated USING (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_payment_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON payment_tokens;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON payment_tokens
  FOR EACH ROW EXECUTE FUNCTION update_payment_tokens_updated_at();

-- Test record
INSERT INTO payment_tokens (order_id, token, amount, status)
VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'test_token_123', 0, 'test')
ON CONFLICT DO NOTHING;

-- =====================================
-- LIVE_ORDERS TABLE (same schema)
-- =====================================

-- Check if live_orders exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_name = 'live_orders'
) AS exists\ \gA