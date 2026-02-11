-- Add missing columns to daily_balances
ALTER TABLE public.daily_balances 
ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES auth.users(id);
