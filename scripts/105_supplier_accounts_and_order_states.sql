-- 105_supplier_accounts_and_order_states.sql
-- This script adds supplier account balances and updates purchase order workflows.

-- 1. Add account_balance to suppliers
ALTER TABLE public.suppliers 
ADD COLUMN IF NOT EXISTS account_balance DECIMAL(15, 2) DEFAULT 0;

-- 2. Update purchase_orders status constraint
-- First, drop the old constraint if it exists (might need to check the actual name from 013_refactor_purchases.sql)
ALTER TABLE public.purchase_orders 
DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

-- Add updated constraint
ALTER TABLE public.purchase_orders 
ADD CONSTRAINT purchase_orders_status_check 
CHECK (status IN ('hold', 'scheduled', 'received', 'pending', 'completed', 'cancelled'));

-- 3. Add supplier_transfer transaction category (if we want explicit enum, but it's a TEXT column usually)
-- The category column in transactions is TEXT.

-- 4. Function to settle purchase order against supplier balance
CREATE OR REPLACE FUNCTION public.handle_purchase_settlement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- If status changed to 'received'
    IF (TG_OP = 'UPDATE' AND OLD.status != 'received' AND NEW.status = 'received') OR
       (TG_OP = 'INSERT' AND NEW.status = 'received') THEN
        
        -- Deduct from supplier balance
        UPDATE public.suppliers 
        SET account_balance = account_balance - NEW.total_amount 
        WHERE id = NEW.supplier_id;
        
    END IF;

    -- If status was 'received' and changed to something else (cancellation/refund logic)
    IF (TG_OP = 'UPDATE' AND OLD.status = 'received' AND NEW.status != 'received') THEN
        
        -- Add back to supplier balance
        UPDATE public.suppliers 
        SET account_balance = account_balance + OLD.total_amount 
        WHERE id = OLD.supplier_id;
        
    END IF;

    -- Handle deletion if it was received
    IF (TG_OP = 'DELETE' AND OLD.status = 'received') THEN
        UPDATE public.suppliers 
        SET account_balance = account_balance + OLD.total_amount 
        WHERE id = OLD.supplier_id;
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger for settlement
DROP TRIGGER IF EXISTS on_purchase_order_settlement ON public.purchase_orders;
CREATE TRIGGER on_purchase_order_settlement
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.handle_purchase_settlement();

-- 5. Helper function/view for Available Balance calculation
-- This can be used by the frontend to check if an order can be placed.
CREATE OR REPLACE FUNCTION public.get_supplier_available_balance(p_supplier_id UUID)
RETURNS DECIMAL(15, 2) LANGUAGE plpgsql AS $$
DECLARE
    v_balance DECIMAL(15, 2);
    v_outstanding DECIMAL(15, 2);
BEGIN
    SELECT account_balance INTO v_balance FROM public.suppliers WHERE id = p_supplier_id;
    
    SELECT COALESCE(SUM(total_amount), 0) INTO v_outstanding 
    FROM public.purchase_orders 
    WHERE supplier_id = p_supplier_id 
    AND status IN ('hold', 'scheduled');
    
    RETURN v_balance - v_outstanding;
END;
$$;

-- 6. Helper to increment supplier balance (used by manual transfers)
CREATE OR REPLACE FUNCTION public.increment_supplier_balance(p_supplier_id UUID, p_amount DECIMAL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.suppliers 
    SET account_balance = account_balance + p_amount 
    WHERE id = p_supplier_id;
END;
$$;

-- 7. Update payment_method constraints to allow 'prepaid'
-- For purchase_orders
ALTER TABLE public.purchase_orders 
DROP CONSTRAINT IF EXISTS purchase_orders_payment_method_check;

ALTER TABLE public.purchase_orders 
ADD CONSTRAINT purchase_orders_payment_method_check 
CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque', 'credit', 'prepaid'));

-- For purchases
ALTER TABLE public.purchases 
DROP CONSTRAINT IF EXISTS purchases_payment_method_check;

ALTER TABLE public.purchases 
ADD CONSTRAINT purchases_payment_method_check 
CHECK (payment_method IN ('bank_transfer', 'cheque', 'cash', 'prepaid'));
