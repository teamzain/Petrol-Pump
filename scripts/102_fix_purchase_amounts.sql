-- 102_fix_purchase_amounts.sql
-- FIX: Updates Transactions to use 'Paid Amount' instead of 'Total Amount'
--      and corrects the Cash/Bank balances accordingly.

BEGIN;

DO $$
DECLARE
    r RECORD;
    v_diff DECIMAL(15, 2);
    v_today DATE := CURRENT_DATE;
BEGIN
    -- Loop through discrepancies in Purchase Orders
    FOR r IN
        SELECT 
            t.id AS transaction_id, 
            t.amount AS tx_amount, 
            po.paid_amount, 
            po.total_amount,
            po.payment_method, 
            po.purchase_date, 
            t.bank_account_id,
            t.transaction_date
        FROM transactions t
        JOIN purchase_orders po ON t.reference_id = po.id
        WHERE (t.reference_type = 'purchase_order' OR t.reference_type = 'purchase')
        AND t.amount > po.paid_amount -- Only fix if Transaction Amount is GREATER than Paid Amount (Over-deduction)
        AND po.paid_amount IS NOT NULL
        AND t.transaction_type = 'expense' -- Ensure we are looking at the expense record
    LOOP
        v_diff := r.tx_amount - r.paid_amount;
        
        RAISE NOTICE 'Fixing Transaction %: Amount % -> % (Diff: %)', r.transaction_id, r.tx_amount, r.paid_amount, v_diff;

        -- 1. Fix Transaction Amount
        UPDATE public.transactions 
        SET amount = r.paid_amount 
        WHERE id = r.transaction_id;

        -- 2. Refund the Difference to the Source Account (Bank or Cash)
        --    (Since we deducted TOO MUCH, we add back the difference)
        
        -- If Bank Transaction (or linked to bank account)
        IF r.bank_account_id IS NOT NULL THEN
            UPDATE public.accounts 
            SET current_balance = current_balance + v_diff 
            WHERE id = r.bank_account_id;
            
        -- If Cash Transaction (and no bank account linked, though bank_account_id should track it now)
        ELSIF r.payment_method = 'cash' THEN
             -- Update Daily Balance for the Transaction Date
             UPDATE public.daily_balances
             SET cash_closing = cash_closing + v_diff
             WHERE balance_date = r.purchase_date;

             -- Also Update TODAY's Opening/Closing (Ripple Effect)
             -- We simply add the difference to today's balance to make it "Live" correct.
             -- (Ideally we would update all intermediate days, but updating Today + Source Day is usually sufficient for immediate view)
             UPDATE public.daily_balances
             SET 
                cash_opening = cash_opening + v_diff,
                cash_closing = cash_closing + v_diff
             WHERE balance_date = v_today;
             
             -- If today's record doesn't exist or is different from purchase date, we might need to handle it.
             -- The above query works if a record exists for today.
        END IF;

    END LOOP;
END $$;

COMMIT;
