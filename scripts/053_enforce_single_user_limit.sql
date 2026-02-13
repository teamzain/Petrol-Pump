
-- 053_enforce_single_user_limit.sql
-- Restricts the system to a single administrator at the database level.
-- This prevents additional signups even if the frontend check is bypassed.

CREATE OR REPLACE FUNCTION public.check_user_limit()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if ANY user already exists in the users table
    IF (SELECT COUNT(*) FROM public.users) >= 1 THEN
        RAISE EXCEPTION 'System registration is locked. Only one user is allowed.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply to the public.users table (which is synced from auth.users)
DROP TRIGGER IF EXISTS restrict_user_signup ON public.users;
CREATE TRIGGER restrict_user_signup
BEFORE INSERT ON public.users
FOR EACH ROW EXECUTE FUNCTION public.check_user_limit();

-- Also apply a policy to allow public count checks for the signup page
DROP POLICY IF EXISTS "Allow public count check" ON public.users;
CREATE POLICY "Allow public count check" ON public.users FOR SELECT USING (true);
