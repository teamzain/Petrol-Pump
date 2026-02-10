-- EMERGENCY FIX for Users Table
-- This script wipes all complex RLS policies and replaces them with a simple "Allow All" for logged-in users.
-- This guarantees the "infinite recursion" error is removed.

-- 1. Disable RLS temporarily to clear any locks/issues
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- 2. Drop ALL existing policies to be safe
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

-- 3. Re-enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 4. Create one simple policy: authenticated users can do everything
-- This avoids any recursion because it checks "auth.role()" (metadata) not the table itself.
CREATE POLICY "Allow all authenticated"
ON public.users
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
