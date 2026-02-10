-- Drop potentially problematic policies (Old names)
DROP POLICY IF EXISTS "Users can view all users" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.users;
DROP POLICY IF EXISTS "Admins can view all" ON public.users;

-- Drop policies we are about to create (New names) to ensure idempotency
DROP POLICY IF EXISTS "Allow read access for authenticated users" ON public.users;
DROP POLICY IF EXISTS "Allow update for own profile" ON public.users;
DROP POLICY IF EXISTS "Allow insert for own profile" ON public.users;
DROP POLICY IF EXISTS "Allow update for admins" ON public.users;

-- Re-enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 1. Simple Read Policy: Allow authenticated users to view all profiles
-- We accept that staff can see other staff names (needed for 'users' page listing)
CREATE POLICY "Allow read access for authenticated users"
ON public.users
FOR SELECT
TO authenticated
USING (true);

-- 2. Update Policy: Users can update their own profile
CREATE POLICY "Allow update for own profile"
ON public.users
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 3. Insert Policy: Users can insert their own profile (usually handled by triggers on auth.users, but good to have)
CREATE POLICY "Allow insert for own profile"
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- 4. Admin Helper Function (IDEMPOTENT CREATION)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  current_role TEXT;
BEGIN
  SELECT role INTO current_role FROM public.users WHERE id = auth.uid();
  RETURN current_role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Admin Update Policy
CREATE POLICY "Allow update for admins"
ON public.users
FOR UPDATE
TO authenticated
USING (public.is_admin());
