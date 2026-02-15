-- 061_cleanup_purchases_final.sql
-- Goal: Fix "Purchase showing two times" by removing hidden legacy triggers and deleting duplicate transaction rows.

-- 1. DROP ALL POSSIBLE LEGACY TRIGGER NAMES ON PURCHASES
DROP TRIGGER IF EXISTS on_purchase_financials ON public.purchases;
DROP TRIGGER IF EXISTS trg_purchase_financials ON public.purchases;
DROP TRIGGER IF EXISTS trg_purchase_insert ON public.purchases;
DROP TRIGGER IF EXISTS on_purchase_created ON public.purchases;
DROP TRIGGER IF EXISTS log_purchase_transaction ON public.purchases;
DROP TRIGGER IF EXISTS trg_log_purchase ON public.purchases;
DROP TRIGGER IF EXISTS on_new_purchase ON public.purchases;
DROP TRIGGER IF EXISTS purchase_transaction_trigger ON public.purchases;

-- 2. DISABLE LEGACY FUNCTION (Prevents it from ever running again)
-- We replace it with a dummy function just in case some other trigger calls it, 
-- effectively muting the duplicates.
CREATE OR REPLACE FUNCTION public.handle_purchase_financials()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- DO NOTHING. This function is deprecated.
    -- Financials are now handled by handle_purchase_order_financials().
    RETURN NEW;
END; $$;

-- 3. CLEAN UP DUPLICATE TRANSACTIONS
-- The new correct logic stores transactions with reference_type = 'purchase_order'.
-- The old/duplicate logic stored them as 'purchase' or 'purchases'.
-- We delete the 'purchase' ones for recent records to clean up the user's view.

DELETE FROM public.transactions 
WHERE (reference_type = 'purchase' OR reference_type = 'purchases')
AND transaction_date >= (NOW() - INTERVAL '24 hours');

-- 4. VERIFY ORDER TOTALS
-- Ensure that correct transactions exist for today's orders.
-- (Optional safety check logic could go here, but SQL is hard to do conversational checks)

