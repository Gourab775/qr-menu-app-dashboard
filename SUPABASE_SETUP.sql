-- Payment Tokens Table SQL
-- Run this in Supabase Dashboard > SQL Editor

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

-- Enable RLS (Row Level Security)
ALTER TABLE payment_tokens ENABLE ROW LEVEL SECURITY;

-- Create index for faster order lookups
CREATE INDEX IF NOT EXISTS idx_payment_tokens_order_id ON payment_tokens(order_id);

-- Policy: Allow authenticated users to insert their own tokens
CREATE POLICY "Users can insert payment_tokens" ON payment_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Policy: Allow authenticated users to select tokens
CREATE POLICY "Users can select payment_tokens" ON payment_tokens
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Policy: Allow authenticated users to update their own tokens
CREATE POLICY "Users can update payment_tokens" ON payment_tokens
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON payment_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Insert a test record to verify table works
INSERT INTO payment_tokens (order_id, token, amount, status)
VALUES 
  ('00000000-0000-0000-0000-000000000000'::uuid, 'test_token_123', 0, 'test')
ON CONFLICT DO NOTHING;

-- Select the record to verify it worked
SELECT * FROM payment_tokens WHERE status = 'test' LIMIT 1;