-- Run this SQL in Supabase Dashboard -> SQL Editor

-- Create the restaurant_tables table
CREATE TABLE IF NOT EXISTS restaurant_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  table_number TEXT NOT NULL,
  table_token TEXT UNIQUE,
  is_active BOOLEAN DEFAULT true,
  capacity INTEGER DEFAULT 4,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, table_number)
);

-- Enable Row Level Security (RLS)
ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access (QR Menu app needs to read table details)
DROP POLICY IF EXISTS "Public can view active restaurant tables" ON restaurant_tables;
CREATE POLICY "Public can view active restaurant tables" ON restaurant_tables
  FOR SELECT TO public USING (is_active = true);

-- Policy: Allow authenticated users to manage their tables
DROP POLICY IF EXISTS "Users can view their restaurant tables" ON restaurant_tables;
CREATE POLICY "Users can view their restaurant tables" ON restaurant_tables
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert their restaurant tables" ON restaurant_tables;
CREATE POLICY "Users can insert their restaurant tables" ON restaurant_tables
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update their restaurant tables" ON restaurant_tables;
CREATE POLICY "Users can update their restaurant tables" ON restaurant_tables
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can delete their restaurant tables" ON restaurant_tables;
CREATE POLICY "Users can delete their restaurant tables" ON restaurant_tables
  FOR DELETE TO authenticated USING (true);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_restaurant_tables_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON restaurant_tables;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON restaurant_tables
  FOR EACH ROW EXECUTE FUNCTION update_restaurant_tables_updated_at();

-- =====================================
-- Ensure live_orders has proper table_id constraint
-- =====================================

-- First ensure the column exists
ALTER TABLE live_orders 
ADD COLUMN IF NOT EXISTS table_id UUID;

-- If it exists as text from a previous migration, you might need to cast it:
-- ALTER TABLE live_orders ALTER COLUMN table_id TYPE UUID USING table_id::UUID;

-- Add foreign key constraint if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'live_orders_table_id_fkey'
  ) THEN
    ALTER TABLE live_orders
    ADD CONSTRAINT live_orders_table_id_fkey 
    FOREIGN KEY (table_id) REFERENCES restaurant_tables(id) ON DELETE SET NULL;
  END IF;
END $$;
