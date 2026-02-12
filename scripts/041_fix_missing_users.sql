-- Fix Missing Users in public.users
-- This script inserts any users from auth.users that are missing in public.users

INSERT INTO public.users (id, email, full_name, username, mobile, role, status)
SELECT 
    au.id,
    au.email,
    COALESCE(au.raw_user_meta_data ->> 'full_name', 'System User'),
    COALESCE(au.raw_user_meta_data ->> 'username', au.email),
    COALESCE(au.raw_user_meta_data ->> 'mobile', ''),
    COALESCE(au.raw_user_meta_data ->> 'role', 'staff'),
    'active'
FROM auth.users au
LEFT JOIN public.users pu ON au.id = pu.id
WHERE pu.id IS NULL;

-- Also check if expenses table is referencing public.users or auth.users
-- If it references public.users, this fix is sufficient.
-- If it references auth.users, then the error implies the ID being sent is invalid, which is rare for authenticated users.

-- Optional: If expenses table doesn't exist (it wasn't in 001), ensure it exists.
-- Since the error was "violations foreign key constraint", the table must exist.
