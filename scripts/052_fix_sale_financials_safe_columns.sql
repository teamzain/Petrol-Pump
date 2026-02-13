
-- 052_fix_sale_financials_safe_columns.sql
-- Fixes the error: "record 'new' has no field 'reading_date'" by avoiding table-specific column access in CASE statements.

CREATE OR REPLACE FUNCTION public.handle_sale_financials()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_account_id UUID;
  v_old_account_id UUID;
  v_method TEXT;
  v_old_method TEXT;
  v_tx_method TEXT;
  v_amount DECIMAL(15, 2);
  v_old_amount DECIMAL(15, 2);
  v_desc TEXT;
  v_date DATE;
  v_old_date DATE;
  v_recorded_by UUID;
BEGIN
    -- 1. PRE-CHECK: Prevent double counting for fuel sales in 'sales' table
    IF TG_TABLE_NAME = 'sales' THEN
        IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
            IF NEW.sale_type = 'fuel' THEN RETURN NEW; END IF;
        END IF;
        IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
            IF OLD.sale_type = 'fuel' THEN RETURN OLD; END IF;
        END IF;
    END IF;

    -- 2. REVERSE OLD IMPACT
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        v_old_amount := OLD.sale_amount;
        
        IF TG_TABLE_NAME = 'nozzle_readings' THEN
            v_old_method := COALESCE(OLD.payment_method, 'cash');
            v_old_account_id := OLD.bank_account_id;
            v_old_date := OLD.reading_date;
        ELSE
            v_old_method := OLD.payment_method;
            v_old_account_id := OLD.bank_account_id;
            v_old_date := OLD.sale_date;
        END IF;
        
        -- Identify Account if not explicit
        IF v_old_account_id IS NULL THEN
            SELECT id INTO v_old_account_id FROM public.accounts 
            WHERE account_type = (CASE WHEN v_old_method IN ('bank', 'bank_transfer', 'cheque') THEN 'bank' ELSE 'cash' END) 
            ORDER BY created_at ASC LIMIT 1;
        END IF;
        
        -- Deduct from account
        IF v_old_account_id IS NOT NULL THEN
            UPDATE public.accounts SET current_balance = current_balance - v_old_amount WHERE id = v_old_account_id;
        END IF;

        -- Update daily_balances
        UPDATE public.daily_balances 
        SET 
            cash_closing = CASE WHEN v_old_method = 'cash' THEN COALESCE(cash_closing, cash_opening) - v_old_amount ELSE cash_closing END,
            bank_closing = CASE WHEN v_old_method != 'cash' AND v_old_method != 'credit' THEN COALESCE(bank_closing, bank_opening) - v_old_amount ELSE bank_closing END,
            updated_at = NOW()
        WHERE balance_date = v_old_date;

        DELETE FROM public.transactions WHERE reference_type = TG_TABLE_NAME AND reference_id = OLD.id;
    END IF;

    -- 3. APPLY NEW IMPACT
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        v_amount := NEW.sale_amount;
        
        IF TG_TABLE_NAME = 'nozzle_readings' THEN
            v_method := COALESCE(NEW.payment_method, 'cash');
            v_account_id := NEW.bank_account_id;
            v_date := NEW.reading_date;
            v_recorded_by := NEW.recorded_by;
        ELSE
            v_method := NEW.payment_method;
            v_account_id := NEW.bank_account_id;
            v_date := NEW.sale_date;
            v_recorded_by := NEW.recorded_by;
        END IF;
        
        -- Identify Account if not explicit
        IF v_account_id IS NULL THEN
            SELECT id INTO v_account_id FROM public.accounts 
            WHERE account_type = (CASE WHEN v_method IN ('bank', 'bank_transfer', 'cheque') THEN 'bank' ELSE 'cash' END) 
            ORDER BY created_at ASC LIMIT 1;
        END IF;
        
        IF v_account_id IS NULL THEN 
            SELECT id INTO v_account_id FROM public.accounts WHERE account_type = 'cash' LIMIT 1;
        END IF;

        -- Update account
        UPDATE public.accounts SET current_balance = current_balance + v_amount WHERE id = v_account_id;

        -- Update daily_balances
        UPDATE public.daily_balances 
        SET 
            cash_closing = CASE WHEN v_method = 'cash' THEN COALESCE(cash_closing, cash_opening) + v_amount ELSE cash_closing END,
            bank_closing = CASE WHEN v_method != 'cash' AND v_method != 'credit' THEN COALESCE(bank_closing, bank_opening) + v_amount ELSE bank_closing END,
            updated_at = NOW()
        WHERE balance_date = v_date;
        
        v_desc := (CASE WHEN TG_TABLE_NAME = 'nozzle_readings' THEN 'Fuel Sale' ELSE 'Product Sale' END) || ' (' || v_method || ')';
        v_tx_method := (CASE WHEN v_method = 'bank' THEN 'bank_transfer' ELSE v_method END);
        
        INSERT INTO public.transactions (
            transaction_date, transaction_type, category, description, amount, 
            payment_method, to_account, reference_type, reference_id, created_by, bank_account_id
        ) VALUES (
            NOW(), 'income', 'sale', v_desc, v_amount, v_tx_method, v_account_id, TG_TABLE_NAME, NEW.id, 
            v_recorded_by, v_account_id
        );
    END IF;

    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;
