-- Complete Supabase Setup SQL
-- Run this in Supabase Dashboard > SQL Editor

-- =====================================
-- LIVE_ORDERS TABLE (same schema)
-- =====================================

-- Check if live_orders exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_name = 'live_orders'
) AS exists;
