-- ENFORCE UNIQUE ACCOUNTS
-- Ensure we only have ONE Cash account and ONE Bank account (for this simple system)

-- 1. Clear duplicates if any (keep the latest one or one with balance)
-- (Since we just truncated, this is safe, but good for robustness)
DELETE FROM public.accounts a USING public.accounts b
WHERE a.id < b.id AND a.account_type = b.account_type;

-- 2. Add Unique Constraint
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS unique_account_type;
ALTER TABLE public.accounts ADD CONSTRAINT unique_account_type UNIQUE (account_type);

-- 3. Update Policy for Opening Balance (Just in case)
DROP POLICY IF EXISTS "Allow all authenticated opening_balance" ON public.opening_balance;
CREATE POLICY "Allow all authenticated opening_balance" ON public.opening_balance FOR ALL TO authenticated USING (true) WITH CHECK (true);
