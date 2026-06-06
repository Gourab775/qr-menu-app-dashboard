-- ============================================================
-- RLS Policy Fix: Restaurant Update Permissions
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Enable RLS on restaurants (if not already enabled)
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;

-- 2. Drop any existing conflicting policies
DROP POLICY IF EXISTS "Users can view own restaurant" ON restaurants;
DROP POLICY IF EXISTS "Users can update own restaurant" ON restaurants;
DROP POLICY IF EXISTS "Users can insert own restaurant" ON restaurants;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON restaurants;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON restaurants;

-- 3. SELECT policy: authenticated users can read the restaurant they belong to
CREATE POLICY "Users can view own restaurant" ON restaurants
  FOR SELECT
  USING (
    id IN (
      SELECT restaurant_id FROM profiles
      WHERE id = auth.uid()
    )
    OR
    user_id = auth.uid()
  );

-- 4. UPDATE policy: authenticated users can update the restaurant they belong to
CREATE POLICY "Users can update own restaurant" ON restaurants
  FOR UPDATE
  USING (
    id IN (
      SELECT restaurant_id FROM profiles
      WHERE id = auth.uid()
    )
    OR
    user_id = auth.uid()
  )
  WITH CHECK (
    id IN (
      SELECT restaurant_id FROM profiles
      WHERE id = auth.uid()
    )
    OR
    user_id = auth.uid()
  );

-- 5. INSERT policy (only for restaurant owners during signup)
CREATE POLICY "Users can insert own restaurant" ON restaurants
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- 6. Ensure RLS on related tables (if not already)
ALTER TABLE landing_page_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage landing page settings" ON landing_page_settings;
CREATE POLICY "Users can manage landing page settings" ON landing_page_settings
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM profiles
      WHERE id = auth.uid()
    )
    OR
    restaurant_id IN (
      SELECT id FROM restaurants
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT restaurant_id FROM profiles
      WHERE id = auth.uid()
    )
    OR
    restaurant_id IN (
      SELECT id FROM restaurants
      WHERE user_id = auth.uid()
    )
  );

-- Verify current policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('restaurants', 'landing_page_settings')
ORDER BY tablename, policyname;
