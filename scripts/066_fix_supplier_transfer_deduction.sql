-- 066_fix_supplier_transfer_deduction.sql
-- Fixes the issue where bank/cash deductions were skipped for supplier transfers.

CREATE OR REPLACE FUNCTION public.handle_manual_transaction_financials()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_from_type TEXT;
    v_to_type TEXT;
    v_date DATE;
BEGIN
    -- Only handle truly manual transactions OR supplier transfers.
    -- Automated transactions like sales, purchases, and expenses have their own triggers
    -- that handle account balance updates and insert into the transactions table.
    -- Supplier transfers (prepaid funds) are initiated from the Balance page and need this trigger.
    IF NEW.reference_type IS NOT NULL AND NEW.reference_type != 'supplier' THEN 
        RETURN NEW; 
    END IF;

    -- Standardize the date (using PKT if possible, but AT TIME ZONE is safer for transactions)
    v_date := (NEW.transaction_date AT TIME ZONE 'Asia/Karachi')::DATE;

    -- Update Source Account (Decrease)
    IF NEW.from_account IS NOT NULL THEN
        UPDATE public.accounts SET current_balance = current_balance - NEW.amount WHERE id = NEW.from_account;
        SELECT account_type INTO v_from_type FROM public.accounts WHERE id = NEW.from_account;
    END IF;

    -- Update Destination Account (Increase)
    IF NEW.to_account IS NOT NULL THEN
        UPDATE public.accounts SET current_balance = current_balance + NEW.amount WHERE id = NEW.to_account;
        SELECT account_type INTO v_to_type FROM public.accounts WHERE id = NEW.to_account;
    END IF;

    -- Update Consolidated Daily Balances
    -- This handles the impact on the 'Balance Overview' cards and total cash/bank figures.
    IF NEW.transaction_type = 'transfer' THEN
        UPDATE public.daily_balances 
        SET 
            cash_closing = CASE 
                WHEN v_from_type = 'cash' THEN COALESCE(cash_closing, cash_opening) - NEW.amount 
                WHEN v_to_type = 'cash' THEN COALESCE(cash_closing, cash_opening) + NEW.amount
                ELSE cash_closing END,
            bank_closing = CASE 
                WHEN v_from_type = 'bank' THEN COALESCE(bank_closing, bank_opening) - NEW.amount 
                WHEN v_to_type = 'bank' THEN COALESCE(bank_closing, bank_opening) + NEW.amount
                ELSE bank_closing END,
            updated_at = NOW()
        WHERE balance_date = v_date;
        
    ELSIF NEW.transaction_type = 'income' THEN
        UPDATE public.daily_balances 
        SET 
            cash_closing = CASE WHEN v_to_type = 'cash' THEN COALESCE(cash_closing, cash_opening) + NEW.amount ELSE cash_closing END,
            bank_closing = CASE WHEN v_to_type = 'bank' THEN COALESCE(bank_closing, bank_opening) + NEW.amount ELSE bank_closing END,
            updated_at = NOW()
        WHERE balance_date = v_date;

    ELSIF NEW.transaction_type = 'expense' THEN
        UPDATE public.daily_balances 
        SET 
            cash_closing = CASE WHEN v_from_type = 'cash' THEN COALESCE(cash_closing, cash_opening) - NEW.amount ELSE cash_closing END,
            bank_closing = CASE WHEN v_from_type = 'bank' THEN COALESCE(bank_closing, bank_opening) - NEW.amount ELSE bank_closing END,
            updated_at = NOW()
        WHERE balance_date = v_date;
    END IF;

    RETURN NEW;
END; $$;

-- Re-ensure the trigger is correctly placed
DROP TRIGGER IF EXISTS on_manual_transaction_financials ON public.transactions;
CREATE TRIGGER on_manual_transaction_financials 
BEFORE INSERT ON public.transactions 
FOR EACH ROW EXECUTE FUNCTION public.handle_manual_transaction_financials();
