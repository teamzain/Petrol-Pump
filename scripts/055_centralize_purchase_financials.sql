-- 055_centralize_purchase_financials.sql
-- Goal: Move financial logging from 'purchases' (items) to 'purchase_orders' (header) 
-- to prevent duplicates and ensure full order visibility in balance movements.

-- 1. DROP LEGACY TRIGGER ON PURCHASES
DROP TRIGGER IF EXISTS on_purchase_financials ON public.purchases;

-- 2. CREATE REFINED FINANCIAL FUNCTION FOR ORDERS
CREATE OR REPLACE FUNCTION public.handle_purchase_order_financials()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_account_id UUID;
  v_method TEXT;
  v_amount DECIMAL(15, 2);
  v_date DATE;
BEGIN
    v_date := NEW.purchase_date;
    v_amount := NEW.paid_amount; -- We only log what was actually PAID
    v_method := COALESCE(NEW.payment_method, 'cash');
    v_account_id := NEW.bank_account_id;

    -- REVERSE OLD IMPACT (on UPDATE/DELETE)
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        -- Revert individual account balance using OLD values
        IF OLD.bank_account_id IS NOT NULL THEN
            UPDATE public.accounts SET current_balance = current_balance + OLD.paid_amount WHERE id = OLD.bank_account_id;
        ELSIF OLD.payment_method = 'cash' THEN
            UPDATE public.accounts SET current_balance = current_balance + OLD.paid_amount 
            WHERE account_type = 'cash' AND status = 'active' ORDER BY created_at ASC LIMIT 1;
        END IF;

        -- Revert consolidated daily balance
        UPDATE public.daily_balances 
        SET 
            cash_closing = CASE WHEN OLD.payment_method = 'cash' THEN COALESCE(cash_closing, cash_opening) + OLD.paid_amount ELSE cash_closing END,
            bank_closing = CASE WHEN OLD.payment_method IN ('bank', 'bank_transfer', 'cheque') THEN COALESCE(bank_closing, bank_opening) + OLD.paid_amount ELSE bank_closing END,
            updated_at = NOW()
        WHERE balance_date = OLD.purchase_date;
        
        -- Remove linked transactions (both the one from this trigger and any legacy ones)
        DELETE FROM public.transactions WHERE reference_id = OLD.id AND (reference_type = 'purchase_order' OR reference_type = 'purchase');
    END IF;

    -- APPLY NEW IMPACT
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        -- Skip financial impact for credit purchases or zero payments
        IF v_method = 'credit' OR v_amount <= 0 THEN RETURN NEW; END IF;
        
        -- Identify Account if not explicit
        IF v_account_id IS NULL THEN
            SELECT id INTO v_account_id FROM public.accounts 
            WHERE account_type = (CASE WHEN v_method IN ('bank', 'bank_transfer', 'cheque') THEN 'bank' ELSE 'cash' END) 
            AND status = 'active'
            ORDER BY created_at ASC LIMIT 1;
        END IF;

        -- Deduct from account balance
        IF v_account_id IS NOT NULL THEN
            UPDATE public.accounts SET current_balance = current_balance - v_amount WHERE id = v_account_id;
        END IF;

        -- Update consolidated daily balance
        UPDATE public.daily_balances 
        SET 
            cash_closing = CASE WHEN v_method = 'cash' THEN COALESCE(cash_closing, cash_opening) - v_amount ELSE cash_closing END,
            bank_closing = CASE WHEN v_method IN ('bank', 'bank_transfer', 'cheque') THEN COALESCE(bank_closing, bank_opening) - v_amount ELSE bank_closing END,
            updated_at = NOW()
        WHERE balance_date = v_date;

        -- Log to transactions table with FULL context
        INSERT INTO public.transactions (
            transaction_date, transaction_type, category, description, amount, 
            payment_method, from_account, reference_type, reference_id, bank_account_id, created_by
        ) VALUES (
            NOW(), 
            'expense', 
            'purchase', 
            'Purchase Order: ' || COALESCE(NEW.invoice_number, 'N/A'), 
            v_amount, 
            (CASE WHEN v_method != 'cash' THEN 'bank_transfer' ELSE 'cash' END), 
            v_account_id, -- This is 'from_account' which was missing in frontend logic
            'purchase_order', 
            NEW.id, 
            v_account_id,
            NEW.created_by
        );
    END IF;

    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;

-- 3. APPLY TRIGGER TO PURCHASE ORDERS
DROP TRIGGER IF EXISTS trg_purchase_order_financials ON public.purchase_orders;
CREATE TRIGGER trg_purchase_order_financials 
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders 
FOR EACH ROW EXECUTE FUNCTION public.handle_purchase_order_financials();
