-- NUCLEAR FIX for ALL RLS Policies
-- Use this if 007 failed. This cleans up BOTH users and pump_config.

-- 1. Disable RLS on critical tables
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pump_config DISABLE ROW LEVEL SECURITY;

-- 2. Drop legacy/conflicting policies on users
DROP POLICY IF EXISTS "Users can view all users" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.users;
DROP POLICY IF EXISTS "Admins can view all" ON public.users;
DROP POLICY IF EXISTS "Allow read access for authenticated users" ON public.users;
DROP POLICY IF EXISTS "Allow update for own profile" ON public.users;
DROP POLICY IF EXISTS "Allow insert for own profile" ON public.users;
DROP POLICY IF EXISTS "Allow update for admins" ON public.users;
DROP POLICY IF EXISTS "Allow all authenticated" ON public.users;

-- 3. Drop legacy/conflicting policies on pump_config
DROP POLICY IF EXISTS "Authenticated users can view/update pump config" ON public.pump_config;
DROP POLICY IF EXISTS "Allow all authenticated pump_config" ON public.pump_config;

-- 4. Re-enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pump_config ENABLE ROW LEVEL SECURITY;

-- 5. Create SIMPLE, NON-RECURSIVE policies
-- "Allow all authenticated users to do anything on these tables"
-- This uses metadata (auth.role) and DOES NOT Query the table itself.

CREATE POLICY "Allow all authenticated"
ON public.users
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow all authenticated pump_config"
ON public.pump_config
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
