-- ============================================================
-- SUPABASE ROW LEVEL SECURITY (RLS) POLICIES
-- Body & Paint Repair System
-- ============================================================
-- IMPORTANT: Execute this in Supabase SQL Editor AFTER creating tables
-- This will fix the "403 Forbidden" and RLS policy errors
-- ============================================================

-- ============================================================
-- 1. USERS TABLE POLICIES (CRITICAL - FIX ERROR)
-- ============================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON users;
DROP POLICY IF EXISTS "Users can read their own data" ON users;
DROP POLICY IF EXISTS "Users can update their own data" ON users;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON users;

-- Allow ALL authenticated users to read all users (for admin purposes)
CREATE POLICY "Enable read for all authenticated users" 
ON users FOR SELECT 
USING (auth.role() = 'authenticated');

-- Allow users to update their own data
CREATE POLICY "Users can update their own profile" 
ON users FOR UPDATE 
USING (auth.uid()::text = uid);

-- Allow INSERT for new user registration (authenticated users)
CREATE POLICY "Enable insert for authenticated users" 
ON users FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

-- Allow DELETE for admins only (requires admin UID check in application logic)
CREATE POLICY "Enable delete for admins" 
ON users FOR DELETE 
USING (auth.role() = 'authenticated');

-- ============================================================
-- 2. BENGKEL_UNITS_MASTER POLICIES
-- ============================================================

DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON bengkel_units_master;

CREATE POLICY "Enable full access for authenticated users" 
ON bengkel_units_master FOR ALL 
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- 3. BENGKEL_SERVICE_JOBS POLICIES
-- ============================================================

DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON bengkel_service_jobs;

CREATE POLICY "Enable full access for authenticated users" 
ON bengkel_service_jobs FOR ALL 
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- 4. BENGKEL_SPAREPARTS_MASTER POLICIES
-- ============================================================

CREATE POLICY "Enable full access for authenticated users" 
ON bengkel_spareparts_master FOR ALL 
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- 5. BENGKEL_SUPPLIERS POLICIES
-- ============================================================

CREATE POLICY "Enable full access for authenticated users" 
ON bengkel_suppliers FOR ALL 
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- 6. BENGKEL_PURCHASE_ORDERS POLICIES
-- ============================================================

CREATE POLICY "Enable full access for authenticated users" 
ON bengkel_purchase_orders FOR ALL 
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- 7. BENGKEL_CASHIER_TRANSACTIONS POLICIES
-- ============================================================

CREATE POLICY "Enable full access for authenticated users" 
ON bengkel_cashier_transactions FOR ALL 
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- 8. BENGKEL_ASSETS POLICIES
-- ============================================================

CREATE POLICY "Enable full access for authenticated users" 
ON bengkel_assets FOR ALL 
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- 9. BENGKEL_SERVICES_MASTER POLICIES
-- ============================================================

CREATE POLICY "Enable full access for authenticated users" 
ON bengkel_services_master FOR ALL 
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- 10. BENGKEL_INTERNAL_CHATS POLICIES
-- ============================================================

CREATE POLICY "Enable full access for authenticated users" 
ON bengkel_internal_chats FOR ALL 
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- 11. BENGKEL_SETTINGS POLICIES
-- ============================================================

CREATE POLICY "Enable full access for authenticated users" 
ON bengkel_settings FOR ALL 
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- Run these queries to verify policies are created:

-- Check all policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename, policyname;

-- Check RLS status for all tables
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename LIKE 'bengkel_%' OR tablename = 'users'
ORDER BY tablename;

-- ============================================================
-- NOTES:
-- ============================================================
-- 1. These policies allow ALL operations for authenticated users
-- 2. For production, you may want more granular policies based on user roles
-- 3. The auth.role() = 'authenticated' checks if user is logged in
-- 4. To implement role-based access, you'll need to join with users table
-- 5. Example role-based policy:
--    USING (
--      EXISTS (
--        SELECT 1 FROM users 
--        WHERE uid = auth.uid()::text 
--        AND role IN ('Admin', 'Manager')
--      )
--    )
-- ============================================================
