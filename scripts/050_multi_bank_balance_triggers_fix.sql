-- 050_multi_bank_balance_triggers_fix.sql
-- Fixes missing financial impact for purchases and manual bank adjustments on daily_balances.

-- 1. Refactor Manual Transaction Trigger to handle all types (Income, Expense, Transfer) for consolidated balances
CREATE OR REPLACE FUNCTION public.handle_manual_transaction_financials()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_from_type TEXT;
    v_to_type TEXT;
    v_date DATE;
BEGIN
    -- Only handle manual entries that are NOT linked to other modules (Reference type is NULL)
    IF NEW.reference_type IS NOT NULL THEN RETURN NEW; END IF;
    v_date := NEW.transaction_date::DATE;

    -- 1. Update Current Account Balances (Individual Banks/Cash)
    IF NEW.from_account IS NOT NULL THEN
        UPDATE public.accounts SET current_balance = current_balance - NEW.amount WHERE id = NEW.from_account;
        SELECT account_type INTO v_from_type FROM public.accounts WHERE id = NEW.from_account;
    END IF;

    IF NEW.to_account IS NOT NULL THEN
        UPDATE public.accounts SET current_balance = current_balance + NEW.amount WHERE id = NEW.to_account;
        SELECT account_type INTO v_to_type FROM public.accounts WHERE id = NEW.to_account;
    End IF;

    -- 2. Update Consolidated Daily Balances (Impact on cash_closing or bank_closing)
    
    -- Case A: Transfer between accounts (Cash <-> Bank or Bank <-> Bank)
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
        
    -- Case B: Manual Income (Increase)
    ELSIF NEW.transaction_type = 'income' THEN
        UPDATE public.daily_balances 
        SET 
            cash_closing = CASE WHEN v_to_type = 'cash' THEN COALESCE(cash_closing, cash_opening) + NEW.amount ELSE cash_closing END,
            bank_closing = CASE WHEN v_to_type = 'bank' THEN COALESCE(bank_closing, bank_opening) + NEW.amount ELSE bank_closing END,
            updated_at = NOW()
        WHERE balance_date = v_date;

    -- Case C: Manual Expense (Decrease)
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

-- 2. Create Purchase Financial Trigger Function
CREATE OR REPLACE FUNCTION public.handle_purchase_financials()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_account_id UUID;
  v_old_account_id UUID;
  v_method TEXT;
  v_old_method TEXT;
  v_amount DECIMAL(15, 2);
  v_old_amount DECIMAL(15, 2);
BEGIN
    -- REVERSE OLD IMPACT
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        v_old_amount := OLD.total_amount;
        v_old_method := COALESCE(OLD.payment_method, 'cash');
        v_old_account_id := OLD.bank_account_id;
        
        -- Identify Account if not explicit
        IF v_old_account_id IS NULL THEN
            SELECT id INTO v_old_account_id FROM public.accounts 
            WHERE account_type = (CASE WHEN v_old_method = 'bank_transfer' THEN 'bank' ELSE 'cash' END) 
            ORDER BY created_at ASC LIMIT 1;
        END IF;

        -- Revert individual account balance
        IF v_old_account_id IS NOT NULL THEN
            UPDATE public.accounts SET current_balance = current_balance + v_old_amount WHERE id = v_old_account_id;
        END IF;

        -- Revert consolidated daily balance
        UPDATE public.daily_balances 
        SET 
            cash_closing = CASE WHEN v_old_method = 'cash' THEN COALESCE(cash_closing, cash_opening) + v_old_amount ELSE cash_closing END,
            bank_closing = CASE WHEN v_old_method = 'bank_transfer' THEN COALESCE(bank_closing, bank_opening) + v_old_amount ELSE bank_closing END,
            updated_at = NOW()
        WHERE balance_date = OLD.purchase_date::DATE;
        
        -- Remove linked transaction
        DELETE FROM public.transactions WHERE reference_type = 'purchase' AND reference_id = OLD.id;
    END IF;

    -- APPLY NEW IMPACT
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        v_amount := NEW.total_amount;
        v_method := COALESCE(NEW.payment_method, 'cash');
        v_account_id := NEW.bank_account_id;
        
        -- Identify Account if not explicit
        IF v_account_id IS NULL THEN
            SELECT id INTO v_account_id FROM public.accounts 
            WHERE account_type = (CASE WHEN v_method = 'bank_transfer' THEN 'bank' ELSE 'cash' END) 
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
            bank_closing = CASE WHEN v_method = 'bank_transfer' THEN COALESCE(bank_closing, bank_opening) - v_amount ELSE bank_closing END,
            updated_at = NOW()
        WHERE balance_date = NEW.purchase_date::DATE;

        -- Log to transactions table
        INSERT INTO public.transactions (
            transaction_date, 
            transaction_type, 
            category, 
            description, 
            amount, 
            payment_method, 
            from_account, 
            reference_type, 
            reference_id, 
            created_by,
            bank_account_id
        ) VALUES (
            NEW.purchase_date::timestamptz, 
            'expense', 
            'purchase', 
            'Purchase: INV-' || COALESCE(NEW.invoice_number, 'N/A'), 
            v_amount, 
            (CASE WHEN v_method = 'bank_transfer' THEN 'bank_transfer' ELSE 'cash' END), 
            v_account_id, 
            'purchase', 
            NEW.id, 
            NEW.recorded_by,
            v_account_id
        );
    END IF;

    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;

-- 3. Apply Trigger to Purchases
DROP TRIGGER IF EXISTS on_purchase_financials ON public.purchases;
CREATE TRIGGER on_purchase_financials 
AFTER INSERT OR UPDATE OR DELETE ON public.purchases 
FOR EACH ROW EXECUTE FUNCTION public.handle_purchase_financials();

-- 4. Double check Expenses trigger (ensure it uses bank_closing correctly)
-- (Already handled in 048, but re-confirming here for consistency)
