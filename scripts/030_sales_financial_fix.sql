-- Module 15: Sales Financial Integration
-- This script enables automated Cash/Bank updates for all sales.

-- 1. Schema Updates
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS sale_type TEXT DEFAULT 'product';
ALTER TABLE public.nozzle_readings ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank'));

-- 2. Robust Financial Trigger Function
CREATE OR REPLACE FUNCTION public.handle_sale_financials()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_account_id UUID;
  v_old_account_id UUID;
  v_method TEXT;
  v_old_method TEXT;
  v_amount DECIMAL(15, 2);
  v_old_amount DECIMAL(15, 2);
  v_desc TEXT;
BEGIN
    -- Handle DELETE or OLD values
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        v_old_amount := OLD.sale_amount;
        v_old_method := OLD.payment_method;
        
        SELECT id INTO v_old_account_id FROM public.accounts 
        WHERE account_type = (CASE WHEN v_old_method = 'bank' OR v_old_method = 'bank_transfer' THEN 'bank' ELSE 'cash' END) LIMIT 1;
        
        -- Deduct previous amount from old account
        IF v_old_account_id IS NOT NULL THEN
            UPDATE public.accounts SET current_balance = current_balance - v_old_amount WHERE id = v_old_account_id;
        END IF;
    END IF;

    -- Handle INSERT or NEW values
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        v_amount := NEW.sale_amount;
        v_method := NEW.payment_method;
        
        SELECT id INTO v_account_id FROM public.accounts 
        WHERE account_type = (CASE WHEN v_method = 'bank' OR v_method = 'bank_transfer' THEN 'bank' ELSE 'cash' END) LIMIT 1;
        
        IF v_account_id IS NULL THEN RAISE EXCEPTION 'No account found for payment method %', v_method; END IF;

        -- Add new amount to current account
        UPDATE public.accounts SET current_balance = current_balance + v_amount WHERE id = v_account_id;
        
        -- Log Transaction for Insert/Update
        v_desc := (CASE WHEN TG_TABLE_NAME = 'sales' THEN 'Product Sale' ELSE 'Fuel Sale' END) || ' (' || v_method || ')';
        
        INSERT INTO public.transactions (
            transaction_date, transaction_type, category, description, amount, 
            payment_method, to_account, reference_type, reference_id, created_by
        ) VALUES (
            NOW(), 'income', 'sale', v_desc, v_amount, v_method, v_account_id, TG_TABLE_NAME, NEW.id, NEW.recorded_by
        );
    END IF;

    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;

-- 3. Apply Triggers
DROP TRIGGER IF EXISTS on_sale_financials ON public.sales;
CREATE TRIGGER on_sale_financials AFTER INSERT OR UPDATE OR DELETE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.handle_sale_financials();

DROP TRIGGER IF EXISTS on_fuel_sale_financials ON public.nozzle_readings;
CREATE TRIGGER on_fuel_sale_financials AFTER INSERT OR UPDATE OR DELETE ON public.nozzle_readings FOR EACH ROW EXECUTE FUNCTION public.handle_sale_financials();
