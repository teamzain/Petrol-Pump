-- 060_master_financial_sync_fix.sql
-- NUCLEAR OPTION: Drops ALL legacy financial triggers and installs a clean, unified set.
-- Prevents double-counting by strictly segregating responsibilities.

-- ==========================================
-- 1. CLEANUP: DROP ALL KNOWN FINANCIAL TRIGGERS
-- ==========================================

-- Sales / Fuel Triggers
DROP TRIGGER IF EXISTS on_sale_financials ON public.sales;
DROP TRIGGER IF EXISTS on_reading_financials ON public.nozzle_readings;
DROP TRIGGER IF EXISTS on_fuel_sale_financials ON public.nozzle_readings;
DROP TRIGGER IF EXISTS trg_sales_financials ON public.sales;
DROP TRIGGER IF EXISTS trg_readings_financials ON public.nozzle_readings;

-- Purchase Triggers (Ensure only Order trigger remains)
DROP TRIGGER IF EXISTS on_purchase_financials ON public.purchases;
DROP TRIGGER IF EXISTS trg_purchase_financials ON public.purchases;

-- Expense Triggers
DROP TRIGGER IF EXISTS on_expense_financials ON public.expenses;
DROP TRIGGER IF EXISTS trg_expense_financials ON public.expenses;

-- ==========================================
-- 2. UNIFIED SALES FINANCIAL FUNCTION
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_master_sales_financials()
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
    v_desc TEXT;
    v_tx_method TEXT;
    v_recorder UUID;
BEGIN
    -- [CRITICAL] PREVENT DOUBLE COUNTING
    -- If trigger is on 'sales' table and it is a FUEL sale, EXIT.
    -- Fuel sales are strictly handled by the 'nozzle_readings' trigger.
    IF TG_TABLE_NAME = 'sales' THEN
        IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
            IF NEW.sale_type = 'fuel' THEN RETURN NEW; END IF;
        END IF;
        IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
            IF OLD.sale_type = 'fuel' THEN RETURN OLD; END IF;
        END IF;
    END IF;

    -- [REVERSE OLD]
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        v_old_amount := CASE WHEN TG_TABLE_NAME = 'nozzle_readings' THEN OLD.sale_amount ELSE OLD.sale_amount END;
        v_old_method := CASE WHEN TG_TABLE_NAME = 'nozzle_readings' THEN COALESCE(OLD.payment_method, 'cash') ELSE OLD.payment_method END;
        v_old_date := CASE WHEN TG_TABLE_NAME = 'nozzle_readings' THEN OLD.reading_date ELSE OLD.sale_date END;
        v_old_account_id := OLD.bank_account_id;

        -- Identify Account
        IF v_old_account_id IS NULL THEN
            SELECT id INTO v_old_account_id FROM public.accounts 
            WHERE account_type = (CASE WHEN v_old_method IN ('bank', 'bank_transfer', 'cheque') THEN 'bank' ELSE 'cash' END) LIMIT 1;
        END IF;

        -- Revert Balance
        IF v_old_account_id IS NOT NULL THEN
            UPDATE public.accounts SET current_balance = current_balance - v_old_amount WHERE id = v_old_account_id;
        END IF;

        -- Revert Daily Balance
        UPDATE public.daily_balances 
        SET 
            cash_closing = CASE WHEN v_old_method = 'cash' THEN COALESCE(cash_closing, cash_opening) - v_old_amount ELSE cash_closing END,
            bank_closing = CASE WHEN v_old_method != 'cash' THEN COALESCE(bank_closing, bank_opening) - v_old_amount ELSE bank_closing END,
            updated_at = NOW()
        WHERE balance_date = v_old_date;

        -- Delete Transaction
        DELETE FROM public.transactions WHERE reference_type = TG_TABLE_NAME AND reference_id = OLD.id;
    END IF;

    -- [APPLY NEW]
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        v_amount := CASE WHEN TG_TABLE_NAME = 'nozzle_readings' THEN NEW.sale_amount ELSE NEW.sale_amount END;
        v_method := CASE WHEN TG_TABLE_NAME = 'nozzle_readings' THEN COALESCE(NEW.payment_method, 'cash') ELSE NEW.payment_method END;
        v_date := CASE WHEN TG_TABLE_NAME = 'nozzle_readings' THEN NEW.reading_date ELSE NEW.sale_date END;
        v_account_id := NEW.bank_account_id;
        v_recorder := NEW.recorded_by;

        -- Identify Account
        IF v_account_id IS NULL THEN
            SELECT id INTO v_account_id FROM public.accounts 
            WHERE account_type = (CASE WHEN v_method IN ('bank', 'bank_transfer', 'cheque') THEN 'bank' ELSE 'cash' END) LIMIT 1;
        END IF;
        
        -- Fallback to default cash
        IF v_account_id IS NULL THEN 
            SELECT id INTO v_account_id FROM public.accounts WHERE account_type = 'cash' LIMIT 1;
        END IF;

        -- Update Balance
        UPDATE public.accounts SET current_balance = current_balance + v_amount WHERE id = v_account_id;

        -- Update Daily Balance
        UPDATE public.daily_balances 
        SET 
            cash_closing = CASE WHEN v_method = 'cash' THEN COALESCE(cash_closing, cash_opening) + v_amount ELSE cash_closing END,
            bank_closing = CASE WHEN v_method != 'cash' THEN COALESCE(bank_closing, bank_opening) + v_amount ELSE bank_closing END,
            updated_at = NOW()
        WHERE balance_date = v_date;

        -- Log Transaction
        v_desc := CASE 
            WHEN TG_TABLE_NAME = 'nozzle_readings' THEN 'Fuel Sale (Direct)' 
            ELSE 'Product Sale' 
        END || ' (' || v_method || ')';
        
        v_tx_method := CASE WHEN v_method = 'bank' THEN 'bank_transfer' ELSE v_method END;

        INSERT INTO public.transactions (
            transaction_date, transaction_type, category, description, amount, 
            payment_method, to_account, reference_type, reference_id, bank_account_id, created_by
        ) VALUES (
            NOW(), 
            'income', 
            'sale', 
            v_desc, 
            v_amount, 
            v_tx_method, 
            v_account_id, 
            TG_TABLE_NAME, 
            NEW.id, 
            v_account_id,
            v_recorder
        );
    END IF;

    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;

-- Apply Triggers
CREATE TRIGGER trg_master_sales_financials
AFTER INSERT OR UPDATE OR DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.handle_master_sales_financials();

CREATE TRIGGER trg_master_readings_financials
AFTER INSERT OR UPDATE OR DELETE ON public.nozzle_readings
FOR EACH ROW EXECUTE FUNCTION public.handle_master_sales_financials();


-- ==========================================
-- 3. UNIFIED EXPENSE FINANCIAL FUNCTION
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_master_expense_financials()
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
    SELECT category_name INTO v_cat_name FROM public.expense_categories WHERE id = COALESCE(NEW.category_id, OLD.category_id);

    -- [REVERSE OLD]
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        v_old_amount := OLD.amount;
        v_old_method := OLD.payment_method;
        v_old_account_id := OLD.bank_account_id;

        IF v_old_account_id IS NULL THEN
            SELECT id INTO v_old_account_id FROM public.accounts 
            WHERE account_type = (CASE WHEN v_old_method IN ('bank_transfer', 'cheque') THEN 'bank' ELSE 'cash' END) LIMIT 1;
        END IF;

        IF v_old_account_id IS NOT NULL THEN
            UPDATE public.accounts SET current_balance = current_balance + v_old_amount WHERE id = v_old_account_id;
        END IF;

        UPDATE public.daily_balances 
        SET 
            cash_closing = CASE WHEN v_old_method = 'cash' THEN COALESCE(cash_closing, cash_opening) + v_old_amount ELSE cash_closing END,
            bank_closing = CASE WHEN v_old_method != 'cash' THEN COALESCE(bank_closing, bank_opening) + v_old_amount ELSE bank_closing END
        WHERE balance_date = OLD.expense_date;

        DELETE FROM public.transactions WHERE reference_type = 'expense' AND reference_id = OLD.id;
    END IF;

    -- [APPLY NEW]
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        v_amount := NEW.amount;
        v_method := NEW.payment_method;
        v_account_id := NEW.bank_account_id;

        IF v_account_id IS NULL THEN
            SELECT id INTO v_account_id FROM public.accounts 
            WHERE account_type = (CASE WHEN v_method IN ('bank_transfer', 'cheque') THEN 'bank' ELSE 'cash' END) LIMIT 1;
        END IF;
        
        IF v_account_id IS NULL THEN 
            RAISE EXCEPTION 'No account found for payment method %', v_method; 
        END IF;

        UPDATE public.accounts SET current_balance = current_balance - v_amount WHERE id = v_account_id;

        UPDATE public.daily_balances 
        SET 
            cash_closing = CASE WHEN v_method = 'cash' THEN COALESCE(cash_closing, cash_opening) - v_amount ELSE cash_closing END,
            bank_closing = CASE WHEN v_method != 'cash' THEN COALESCE(bank_closing, bank_opening) - v_amount ELSE bank_closing END,
            updated_at = NOW()
        WHERE balance_date = NEW.expense_date;

        v_desc := 'Expense: ' || NEW.description || ' (Paid to: ' || COALESCE(NEW.paid_to, 'N/A') || ')';

        INSERT INTO public.transactions (
            transaction_date, transaction_type, category, description, amount, 
            payment_method, from_account, reference_type, reference_id, bank_account_id, created_by
        ) VALUES (
            NEW.expense_date::timestamptz, 
            'expense', 
            v_cat_name, 
            v_desc, 
            v_amount, 
            v_method, 
            v_account_id, 
            'expense', 
            NEW.id, 
            v_account_id,
            NEW.created_by
        );
    END IF;

    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;

-- Apply Trigger
CREATE TRIGGER trg_master_expense_financials
AFTER INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.handle_master_expense_financials();
