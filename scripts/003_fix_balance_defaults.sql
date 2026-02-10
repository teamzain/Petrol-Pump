-- Fix Daily Balances Defaults
-- The default of 0 causes issues with logic checking for NULL to determine if a running balance exists.

ALTER TABLE public.daily_balances ALTER COLUMN cash_closing DROP DEFAULT;
ALTER TABLE public.daily_balances ALTER COLUMN bank_closing DROP DEFAULT;

ALTER TABLE public.daily_balances ALTER COLUMN cash_closing SET DEFAULT NULL;
ALTER TABLE public.daily_balances ALTER COLUMN bank_closing SET DEFAULT NULL;

-- Fix existing rows where values are 0 (assuming 0 means unset because opening is non-zero, or just reset them to NULL to force recalculation from opening if needed, though safely we should only target 0s that likely shouldn't be 0)
-- A safer approach is to set them to NULL if they are 0.
UPDATE public.daily_balances SET cash_closing = NULL WHERE cash_closing = 0;
UPDATE public.daily_balances SET bank_closing = NULL WHERE bank_closing = 0;
