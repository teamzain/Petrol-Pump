-- REMOVE UNIQUE ACCOUNT TYPE CONSTRAINT
-- This constraint was added in 012_enforce_unique_accounts.sql and prevents multiple bank accounts.
-- To support multi-bank, we must allow multiple records with account_type = 'bank'.

ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS unique_account_type;

-- Optional: Add a unique constraint on account_name to prevent identical names
ALTER TABLE public.accounts ADD CONSTRAINT unique_account_name UNIQUE (account_name);

-- Ensure there is at least one cash account (usually true, but good to keep in mind)
-- We still want only ONE cash account for simplicity, but multiple bank accounts.
-- We can do this with a partial unique index if needed:
-- CREATE UNIQUE INDEX IF NOT EXISTS unique_cash_account ON public.accounts (account_type) WHERE account_type = 'cash';
