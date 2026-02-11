-- RESTORE USER PROFILES
-- Truncating public.users deleted your 'Admin' status.
-- This script repopulates public.users from the hidden auth.users table
-- and ensures you are an Admin again.

INSERT INTO public.users (id, email, username, full_name, mobile, role, status)
SELECT 
  id, 
  email, 
  COALESCE(raw_user_meta_data->>'username', email),
  COALESCE(raw_user_meta_data->>'full_name', ''),
  COALESCE(raw_user_meta_data->>'mobile', ''),
  'admin', -- FORCE ADMIN ROLE
  'active'
FROM auth.users
ON CONFLICT (id) DO UPDATE
SET role = 'admin', status = 'active'; -- Ensure existing users become admins/active
