-- Module 15: Expense Financial Automation
-- This script enables automated Cash/Bank updates and Transaction logging for all expenses.

-- 1. Robust Expense Financial Trigger Function
CREATE OR REPLACE FUNCTION public.handle_expense_financials()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_account_id UUID;
  v_old_account_id UUID;
  v_method TEXT;
  v_old_method TEXT;
  v_amount DECIMAL(15, 2);
  v_old_amount DECIMAL(15, 2);
  v_cat_name TEXT;
  v_desc TEXT;
BEGIN
    -- Get Category Name for Transaction Log
    SELECT category_name INTO v_cat_name FROM public.expense_categories WHERE id = COALESCE(NEW.category_id, OLD.category_id);

    -- Handle DELETE or OLD values (Reverse previous balance impact)
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        v_old_amount := OLD.amount;
        v_old_method := OLD.payment_method;
        
        SELECT id INTO v_old_account_id FROM public.accounts 
        WHERE account_type = (CASE WHEN v_old_method = 'bank_transfer' OR v_old_method = 'cheque' THEN 'bank' ELSE 'cash' END) LIMIT 1;
        
        -- Add back previous expense amount to old account
        IF v_old_account_id IS NOT NULL THEN
            UPDATE public.accounts SET current_balance = current_balance + v_old_amount WHERE id = v_old_account_id;
        END IF;

        -- Reverse impact on daily_balances
        UPDATE public.daily_balances 
        SET 
            cash_closing = CASE WHEN v_old_method = 'cash' THEN COALESCE(cash_closing, cash_opening) + v_old_amount ELSE cash_closing END,
            bank_closing = CASE WHEN v_old_method != 'cash' THEN COALESCE(bank_closing, bank_opening) + v_old_amount ELSE bank_closing END
        WHERE balance_date = OLD.expense_date;
        
        -- Remove linked transaction
        DELETE FROM public.transactions WHERE reference_type = 'expense' AND reference_id = OLD.id;
    END IF;

    -- Handle INSERT or NEW values (Apply balance impact)
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        v_amount := NEW.amount;
        v_method := NEW.payment_method;
        
        SELECT id INTO v_account_id FROM public.accounts 
        WHERE account_type = (CASE WHEN v_method = 'bank_transfer' OR v_method = 'cheque' THEN 'bank' ELSE 'cash' END) LIMIT 1;
        
        IF v_account_id IS NULL THEN RAISE EXCEPTION 'No account found for payment method %', v_method; END IF;

        -- Deduct amount from current account
        UPDATE public.accounts SET current_balance = current_balance - v_amount WHERE id = v_account_id;

        -- Update daily_balances
        -- We use COALESCE to ensure we start from opening if closing is NULL
        UPDATE public.daily_balances 
        SET 
            cash_closing = CASE WHEN v_method = 'cash' THEN COALESCE(cash_closing, cash_opening) - v_amount ELSE cash_closing END,
            bank_closing = CASE WHEN v_method != 'cash' THEN COALESCE(bank_closing, bank_opening) - v_amount ELSE bank_closing END,
            updated_at = NOW()
        WHERE balance_date = NEW.expense_date;
        
        -- Log Transaction
        v_desc := 'Expense: ' || NEW.description || ' (Paid to: ' || COALESCE(NEW.paid_to, 'N/A') || ')';
        
        INSERT INTO public.transactions (
            transaction_date, transaction_type, category, description, amount, 
            payment_method, from_account, reference_type, reference_id, created_by
        ) VALUES (
            NEW.expense_date::timestamptz, 'expense', v_cat_name, v_desc, v_amount, v_method, v_account_id, 'expense', NEW.id, NEW.created_by
        );
    END IF;

    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;

-- 2. Apply Trigger
DROP TRIGGER IF EXISTS on_expense_financials ON public.expenses;
CREATE TRIGGER on_expense_financials AFTER INSERT OR UPDATE OR DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.handle_expense_financials();
