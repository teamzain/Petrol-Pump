-- Fix Timezone in Triggers to force Pakistan Standard Time
-- This ensures that transactions and dates are recorded in PKT, resolving day-shift issues.

-- 1. Updates handle_sale_financials to use PKT for Transaction Date and Updates
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
  v_current_time TIMESTAMPTZ;
BEGIN
    -- Force PKT time (Wall clock time of Karachi stored as UTC instant to align dates)
    -- This is a practical fix for "Server in USA, User in PKT" date grouping issues.
    v_current_time := (NOW() AT TIME ZONE 'Asia/Karachi');

    -- =================================================================================================
    -- PRE-CHECK: Prevent Double Counting for Fuel Sales
    -- =================================================================================================
    IF TG_TABLE_NAME = 'sales' THEN
        IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
            IF NEW.sale_type = 'fuel' THEN RETURN NEW; END IF;
        END IF;
        IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
            IF OLD.sale_type = 'fuel' THEN RETURN OLD; END IF;
        END IF;
    END IF;

    -- =================================================================================================
    -- DELETE / UPDATE (Reverse ONLY)
    -- =================================================================================================
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        v_old_amount := CASE WHEN TG_TABLE_NAME = 'nozzle_readings' THEN OLD.sale_amount ELSE OLD.sale_amount END;
        
        IF TG_TABLE_NAME = 'nozzle_readings' THEN
            v_old_method := 'cash';
        ELSE
            v_old_method := OLD.payment_method;
        END IF;
        
        SELECT id INTO v_old_account_id FROM public.accounts 
        WHERE account_type = (CASE WHEN v_old_method IN ('bank', 'bank_transfer', 'cheque') THEN 'bank' ELSE 'cash' END) LIMIT 1;
        
        IF v_old_account_id IS NOT NULL THEN
            UPDATE public.accounts SET current_balance = current_balance - v_old_amount WHERE id = v_old_account_id;
        END IF;

        IF TG_TABLE_NAME = 'nozzle_readings' THEN
             UPDATE public.daily_balances 
             SET 
                cash_closing = CASE WHEN v_old_method = 'cash' THEN COALESCE(cash_closing, cash_opening) - v_old_amount ELSE cash_closing END,
                bank_closing = CASE WHEN v_old_method != 'cash' THEN COALESCE(bank_closing, bank_opening) - v_old_amount ELSE bank_closing END
             WHERE balance_date = OLD.reading_date;
        ELSE
             UPDATE public.daily_balances 
             SET 
                cash_closing = CASE WHEN v_old_method = 'cash' THEN COALESCE(cash_closing, cash_opening) - v_old_amount ELSE cash_closing END,
                bank_closing = CASE WHEN v_old_method != 'cash' THEN COALESCE(bank_closing, bank_opening) - v_old_amount ELSE bank_closing END
             WHERE balance_date = OLD.sale_date;
        END IF;

        DELETE FROM public.transactions WHERE reference_type = TG_TABLE_NAME AND reference_id = OLD.id;
    END IF;

    -- =================================================================================================
    -- INSERT / UPDATE (Apply NEW)
    -- =================================================================================================
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        v_amount := CASE WHEN TG_TABLE_NAME = 'nozzle_readings' THEN NEW.sale_amount ELSE NEW.sale_amount END;
        
        IF TG_TABLE_NAME = 'nozzle_readings' THEN
            v_method := 'cash';
        ELSE
            v_method := NEW.payment_method;
        END IF;
        
        SELECT id INTO v_account_id FROM public.accounts 
        WHERE account_type = (CASE WHEN v_method IN ('bank', 'bank_transfer', 'cheque') THEN 'bank' ELSE 'cash' END) LIMIT 1;
        
        IF v_account_id IS NULL THEN 
            SELECT id INTO v_account_id FROM public.accounts WHERE account_type = 'cash' LIMIT 1;
        END IF;

        UPDATE public.accounts SET current_balance = current_balance + v_amount WHERE id = v_account_id;

        IF TG_TABLE_NAME = 'nozzle_readings' THEN
             UPDATE public.daily_balances 
             SET 
                cash_closing = CASE WHEN v_method = 'cash' THEN COALESCE(cash_closing, cash_opening) + v_amount ELSE cash_closing END,
                bank_closing = CASE WHEN v_method != 'cash' THEN COALESCE(bank_closing, bank_opening) + v_amount ELSE bank_closing END,
                updated_at = v_current_time -- Use PKT time
             WHERE balance_date = NEW.reading_date;
        ELSE
             UPDATE public.daily_balances 
             SET 
                cash_closing = CASE WHEN v_method = 'cash' THEN COALESCE(cash_closing, cash_opening) + v_amount ELSE cash_closing END,
                bank_closing = CASE WHEN v_method != 'cash' THEN COALESCE(bank_closing, bank_opening) + v_amount ELSE bank_closing END,
                updated_at = v_current_time -- Use PKT time
             WHERE balance_date = NEW.sale_date;
        END IF;
        
        IF TG_TABLE_NAME = 'nozzle_readings' THEN
            v_desc := 'Fuel Sale' || ' (Direct Cash)';
        ELSE
            v_desc := 'Product Sale' || ' (' || v_method || ')';
        END IF;
        
        IF v_method = 'bank' THEN 
            v_tx_method := 'bank_transfer';
        ELSE
             v_tx_method := v_method;
        END IF;
        
        INSERT INTO public.transactions (
            transaction_date, 
            transaction_type, 
            category, 
            description, 
            amount, 
            payment_method, 
            to_account, 
            reference_type, 
            reference_id, 
            created_by
        ) VALUES (
            v_current_time, -- CRITICAL: Use PKT Time
            'income', 
            'sale', 
            v_desc, 
            v_amount, 
            v_tx_method, 
            v_account_id, 
            TG_TABLE_NAME, 
            NEW.id, 
            CASE WHEN TG_TABLE_NAME = 'nozzle_readings' THEN NEW.recorded_by ELSE NEW.recorded_by END
        );
    END IF;

    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;

-- 2. Update Column Defaults for Future Inserts (Optional but recommended)
-- This tries to set the default to PKT date for tables that use CURRENT_DATE
ALTER TABLE public.expenses ALTER COLUMN expense_date SET DEFAULT (NOW() AT TIME ZONE 'Asia/Karachi')::DATE;
ALTER TABLE public.sales ALTER COLUMN sale_date SET DEFAULT (NOW() AT TIME ZONE 'Asia/Karachi')::DATE;
ALTER TABLE public.nozzle_readings ALTER COLUMN reading_date SET DEFAULT (NOW() AT TIME ZONE 'Asia/Karachi')::DATE;
ALTER TABLE public.daily_balances ALTER COLUMN balance_date SET DEFAULT (NOW() AT TIME ZONE 'Asia/Karachi')::DATE;
