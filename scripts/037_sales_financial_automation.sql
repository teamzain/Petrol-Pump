-- Module 15: Sales Financial Automation
-- This script enables automated Cash/Bank updates for all sales (Fuel & Products).
-- It prevents double-counting by ensuring 'sales' table triggers ignore fuel sales (handled by nozzle_readings).

-- 1. Schema Updates (Idempotent)
DO $$ 
BEGIN
    -- Ensure sale_type exists on sales
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='sale_type') THEN
        ALTER TABLE public.sales ADD COLUMN sale_type TEXT DEFAULT 'product';
    END IF;

    -- Ensure payment_method exists on nozzle_readings
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='nozzle_readings' AND column_name='payment_method') THEN
        ALTER TABLE public.nozzle_readings ADD COLUMN payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank'));
    END IF;
END $$;

-- 2. Robust Financial Trigger Function
CREATE OR REPLACE FUNCTION public.handle_sale_financials()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_account_id UUID;
  v_old_account_id UUID;
  v_method TEXT;
  v_old_method TEXT;
  v_tx_method TEXT; -- For transaction table
  v_amount DECIMAL(15, 2);
  v_old_amount DECIMAL(15, 2);
  v_desc TEXT;
  v_is_fuel_sale BOOLEAN;
BEGIN
    -- =================================================================================================
    -- PRE-CHECK: Prevent Double Counting for Fuel Sales
    -- =================================================================================================
    -- If this is the 'sales' table and it's a FUEL sale, IGNORE IT.
    -- Nozzle Readings trigger will handle the financial impact for fuel.
    IF TG_TABLE_NAME = 'sales' THEN
        -- Check NEW record for INSERT/UPDATE
        IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
            IF NEW.sale_type = 'fuel' THEN RETURN NEW; END IF;
        END IF;
        -- Check OLD record for DELETE/UPDATE
        IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
            IF OLD.sale_type = 'fuel' THEN RETURN OLD; END IF;
        END IF;
    END IF;

    -- =================================================================================================
    -- DELETE / UPDATE (Reverse ONLY): Revert impact of OLD record
    -- =================================================================================================
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        v_old_amount := CASE WHEN TG_TABLE_NAME = 'nozzle_readings' THEN OLD.sale_amount ELSE OLD.sale_amount END;
        
        -- Default to CASH for Fuel Sales (Nozzle Readings), use selected method for Product Sales
        IF TG_TABLE_NAME = 'nozzle_readings' THEN
            v_old_method := 'cash';
        ELSE
            v_old_method := OLD.payment_method;
        END IF;
        
        -- Identify Account (Bank vs Cash)
        SELECT id INTO v_old_account_id FROM public.accounts 
        WHERE account_type = (CASE WHEN v_old_method IN ('bank', 'bank_transfer', 'cheque') THEN 'bank' ELSE 'cash' END) LIMIT 1;
        
        -- Deduct previous amount from old account (Reverse the Income)
        IF v_old_account_id IS NOT NULL THEN
            UPDATE public.accounts SET current_balance = current_balance - v_old_amount WHERE id = v_old_account_id;
        END IF;

        -- Reverse impact on daily_balances
        -- Determine date
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

        -- Remove linked transaction log
        DELETE FROM public.transactions WHERE reference_type = TG_TABLE_NAME AND reference_id = OLD.id;
    END IF;

    -- =================================================================================================
    -- INSERT / UPDATE (Apply NEW): Apply impact of NEW record
    -- =================================================================================================
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        v_amount := CASE WHEN TG_TABLE_NAME = 'nozzle_readings' THEN NEW.sale_amount ELSE NEW.sale_amount END;
        
        -- Default to CASH for Fuel Sales (Nozzle Readings), use selected method for Product Sales
        IF TG_TABLE_NAME = 'nozzle_readings' THEN
            v_method := 'cash';
        ELSE
            v_method := NEW.payment_method;
        END IF;
        
        -- Identify Account
        SELECT id INTO v_account_id FROM public.accounts 
        WHERE account_type = (CASE WHEN v_method IN ('bank', 'bank_transfer', 'cheque') THEN 'bank' ELSE 'cash' END) LIMIT 1;
        
        IF v_account_id IS NULL THEN 
            SELECT id INTO v_account_id FROM public.accounts WHERE account_type = 'cash' LIMIT 1;
        END IF;

        -- Add new amount to current account (Income)
        UPDATE public.accounts SET current_balance = current_balance + v_amount WHERE id = v_account_id;

        -- Update daily_balances
        -- We use COALESCE to ensure we start from opening if closing is NULL
        IF TG_TABLE_NAME = 'nozzle_readings' THEN
             UPDATE public.daily_balances 
             SET 
                cash_closing = CASE WHEN v_method = 'cash' THEN COALESCE(cash_closing, cash_opening) + v_amount ELSE cash_closing END,
                bank_closing = CASE WHEN v_method != 'cash' THEN COALESCE(bank_closing, bank_opening) + v_amount ELSE bank_closing END,
                updated_at = NOW()
             WHERE balance_date = NEW.reading_date;
        ELSE
             UPDATE public.daily_balances 
             SET 
                cash_closing = CASE WHEN v_method = 'cash' THEN COALESCE(cash_closing, cash_opening) + v_amount ELSE cash_closing END,
                bank_closing = CASE WHEN v_method != 'cash' THEN COALESCE(bank_closing, bank_opening) + v_amount ELSE bank_closing END,
                updated_at = NOW()
             WHERE balance_date = NEW.sale_date;
        END IF;
        
        -- Log Transaction
        IF TG_TABLE_NAME = 'nozzle_readings' THEN
            v_desc := 'Fuel Sale' || ' (Direct Cash)';
        ELSE
            v_desc := 'Product Sale' || ' (' || v_method || ')';
        END IF;
        
        -- FIX: Map 'bank' to 'bank_transfer' for transactions table constraint
        IF v_method = 'bank' THEN 
            v_tx_method := 'bank_transfer';
        ELSE
             v_tx_method := v_method;
        END IF;
        
        -- Insert Transaction Record
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
            NOW(), 
            'income', 
            'sale', 
            v_desc, 
            v_amount, 
            v_tx_method, -- Use mapped method
            v_account_id, 
            TG_TABLE_NAME, 
            NEW.id, 
            CASE WHEN TG_TABLE_NAME = 'nozzle_readings' THEN NEW.recorded_by ELSE NEW.recorded_by END
        );
    END IF;

    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;

-- 3. Apply Triggers
DROP TRIGGER IF EXISTS on_sale_financials ON public.sales;
CREATE TRIGGER on_sale_financials 
AFTER INSERT OR UPDATE OR DELETE ON public.sales 
FOR EACH ROW EXECUTE FUNCTION public.handle_sale_financials();

DROP TRIGGER IF EXISTS on_reading_financials ON public.nozzle_readings;
CREATE TRIGGER on_reading_financials 
AFTER INSERT OR UPDATE OR DELETE ON public.nozzle_readings 
FOR EACH ROW EXECUTE FUNCTION public.handle_sale_financials();

-- Clean up any potential double triggers from previous attempts
DROP TRIGGER IF EXISTS on_fuel_sale_financials ON public.nozzle_readings;
