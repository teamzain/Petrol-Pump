-- 051_ultimate_multi_bank_fix.sql
-- Comprehensive fix for bank deductions, consolidated balance sync, and timezone issues.

-- 1. FIX: Update handle_purchase_financials to handle all bank methods and fix column names
CREATE OR REPLACE FUNCTION public.handle_purchase_financials()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_account_id UUID;
  v_old_account_id UUID;
  v_method TEXT;
  v_old_method TEXT;
  v_amount DECIMAL(15, 2);
  v_old_amount DECIMAL(15, 2);
  v_date DATE;
  v_old_date DATE;
BEGIN
    -- DATE columns don't need AT TIME ZONE
    v_date := NEW.purchase_date;
    v_old_date := OLD.purchase_date;

    -- REVERSE OLD IMPACT
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        v_old_amount := OLD.total_amount;
        v_old_method := COALESCE(OLD.payment_method, 'cash');
        v_old_account_id := OLD.bank_account_id;
        
        -- Identify Account if not explicit
        IF v_old_account_id IS NULL THEN
            SELECT id INTO v_old_account_id FROM public.accounts 
            WHERE account_type = (CASE WHEN v_old_method IN ('bank', 'bank_transfer', 'cheque') THEN 'bank' ELSE 'cash' END) 
            ORDER BY created_at ASC LIMIT 1;
        END IF;

        -- Revert individual account balance
        IF v_old_account_id IS NOT NULL THEN
            UPDATE public.accounts SET current_balance = current_balance + v_old_amount WHERE id = v_old_account_id;
        END IF;

        -- Revert consolidated daily balance (Use != 'cash' to catch all bank/cheque methods)
        UPDATE public.daily_balances 
        SET 
            cash_closing = CASE WHEN v_old_method = 'cash' THEN COALESCE(cash_closing, cash_opening) + v_old_amount ELSE cash_closing END,
            bank_closing = CASE WHEN v_old_method != 'cash' AND v_old_method != 'credit' THEN COALESCE(bank_closing, bank_opening) + v_old_amount ELSE bank_closing END,
            updated_at = NOW()
        WHERE balance_date = v_old_date;
        
        -- Remove linked transaction
        DELETE FROM public.transactions WHERE reference_type = 'purchase' AND reference_id = OLD.id;
    END IF;

    -- APPLY NEW IMPACT
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        v_amount := NEW.total_amount;
        v_method := COALESCE(NEW.payment_method, 'cash');
        v_account_id := NEW.bank_account_id;

        -- Skip financial impact for credit purchases (ledger handles it if implemented, otherwise just stock change)
        IF v_method = 'credit' THEN RETURN NEW; END IF;
        
        -- Identify Account if not explicit
        IF v_account_id IS NULL THEN
            SELECT id INTO v_account_id FROM public.accounts 
            WHERE account_type = (CASE WHEN v_method IN ('bank', 'bank_transfer', 'cheque') THEN 'bank' ELSE 'cash' END) 
            ORDER BY created_at ASC LIMIT 1;
        END IF;

        IF v_account_id IS NULL THEN 
            SELECT id INTO v_account_id FROM public.accounts WHERE account_type = 'cash' LIMIT 1;
        END IF;

        -- Deduct from account balance
        UPDATE public.accounts SET current_balance = current_balance - v_amount WHERE id = v_account_id;

        -- Update consolidated daily balance
        UPDATE public.daily_balances 
        SET 
            cash_closing = CASE WHEN v_method = 'cash' THEN COALESCE(cash_closing, cash_opening) - v_amount ELSE cash_closing END,
            bank_closing = CASE WHEN v_method != 'cash' AND v_method != 'credit' THEN COALESCE(bank_closing, bank_opening) - v_amount ELSE bank_closing END,
            updated_at = NOW()
        WHERE balance_date = v_date;

        -- Log to transactions table
        -- Use NULL for created_by or auth.uid() if column missing in purchases
        INSERT INTO public.transactions (
            transaction_date, transaction_type, category, description, amount, 
            payment_method, from_account, reference_type, reference_id, bank_account_id
        ) VALUES (
            NOW(), 'expense', 'purchase', 'Purchase: INV-' || COALESCE(NEW.invoice_number, 'N/A'), 
            v_amount, (CASE WHEN v_method != 'cash' THEN 'bank_transfer' ELSE 'cash' END), 
            v_account_id, 'purchase', NEW.id, v_account_id
        );
    END IF;

    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;

-- 2. FIX: Refactor Manual Transaction Trigger for Timezone and Consistency
CREATE OR REPLACE FUNCTION public.handle_manual_transaction_financials()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_from_type TEXT;
    v_to_type TEXT;
    v_date DATE;
BEGIN
    IF NEW.reference_type IS NOT NULL THEN RETURN NEW; END IF;
    v_date := (NEW.transaction_date AT TIME ZONE 'Asia/Karachi')::DATE;

    IF NEW.from_account IS NOT NULL THEN
        UPDATE public.accounts SET current_balance = current_balance - NEW.amount WHERE id = NEW.from_account;
        SELECT account_type INTO v_from_type FROM public.accounts WHERE id = NEW.from_account;
    END IF;

    IF NEW.to_account IS NOT NULL THEN
        UPDATE public.accounts SET current_balance = current_balance + NEW.amount WHERE id = NEW.to_account;
        SELECT account_type INTO v_to_type FROM public.accounts WHERE id = NEW.to_account;
    End IF;

    -- Update Consolidated Daily Balances
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

-- 3. NEW: Trigger to sync account opening balances with daily_balances
CREATE OR REPLACE FUNCTION public.sync_account_opening_with_daily_balances()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Karachi')::DATE;
    v_delta DECIMAL(15, 2);
BEGIN
    v_delta := NEW.opening_balance - COALESCE(OLD.opening_balance, 0);
    
    IF v_delta = 0 THEN RETURN NEW; END IF;

    -- Update today's record (both opening and closing to keep it consistent)
    UPDATE public.daily_balances
    SET 
        cash_opening = CASE WHEN NEW.account_type = 'cash' THEN COALESCE(cash_opening, 0) + v_delta ELSE cash_opening END,
        bank_opening = CASE WHEN NEW.account_type = 'bank' THEN COALESCE(bank_opening, 0) + v_delta ELSE bank_opening END,
        cash_closing = CASE WHEN NEW.account_type = 'cash' THEN COALESCE(cash_closing, 0) + v_delta ELSE cash_closing END,
        bank_closing = CASE WHEN NEW.account_type = 'bank' THEN COALESCE(bank_closing, 0) + v_delta ELSE bank_closing END,
        updated_at = NOW()
    WHERE balance_date = v_today;

    RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_account_opening ON public.accounts;
CREATE TRIGGER trg_sync_account_opening 
AFTER INSERT OR UPDATE OF opening_balance ON public.accounts 
FOR EACH ROW EXECUTE FUNCTION public.sync_account_opening_with_daily_balances();

-- Final cleanup of double triggers if any
DROP TRIGGER IF EXISTS on_purchase_financials ON public.purchases;
CREATE TRIGGER on_purchase_financials 
AFTER INSERT OR UPDATE OR DELETE ON public.purchases 
FOR EACH ROW EXECUTE FUNCTION public.handle_purchase_financials();
