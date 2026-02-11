-- 035_fix_balance_closure_schema.sql
-- This script fixes the 400 Bad Request error when closing the day by ensuring all columns exist 
-- and use the correct foreign key references.

-- 1. Ensure columns exist and have correct types
ALTER TABLE public.daily_balances 
ADD COLUMN IF NOT EXISTS is_closed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS closed_by UUID;

-- 2. Update foreign key reference to public.users for better reliability with PostgREST
-- First drop existing if it was pointing to auth.users (from 018)
ALTER TABLE public.daily_balances DROP CONSTRAINT IF EXISTS daily_balances_closed_by_fkey;

-- Now add it back referencing public.users
ALTER TABLE public.daily_balances 
ADD CONSTRAINT daily_balances_closed_by_fkey 
FOREIGN KEY (closed_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- 3. Optimization: Ensure balance_date is UNIQUE (should be already, but safety first)
-- DROP INDEX IF EXISTS idx_balance_date_unique;
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_balance_date_unique ON public.daily_balances(balance_date);

-- 4. Initial check: If any record is missing is_closed but has closed_at, mark it closed
UPDATE public.daily_balances 
SET is_closed = TRUE 
WHERE closed_at IS NOT NULL AND is_closed = FALSE;
