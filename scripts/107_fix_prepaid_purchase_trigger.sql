-- 107_fix_prepaid_purchase_trigger.sql
-- Fixes double-deduction: 'prepaid' orders should not touch Bank/Cash accounts again.
-- Also updates transaction constraints to support new payment methods.

-- [0] UPDATE TRANSACTION CONSTRAINTS (Crucial for allowing 'prepaid' and 'card' entries)
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_payment_method_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_payment_method_check 
CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque', 'prepaid', 'card', 'bank'));

CREATE OR REPLACE FUNCTION public.handle_purchase_order_financials()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_account_id UUID;
  v_method TEXT;
  v_amount DECIMAL(15, 2);
  v_date DATE;
  v_is_prepaid BOOLEAN;
BEGIN
    -- Move NEW assignments inside conditional to avoid DELETE failures
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        v_date := NEW.purchase_date;
        v_amount := NEW.paid_amount;
        v_method := COALESCE(NEW.payment_method, 'cash');
        v_account_id := NEW.bank_account_id;
        v_is_prepaid := (v_method = 'prepaid');
    END IF;

    -- [1] REVERSE OLD IMPACT
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        -- ONLY REVERSE IF IT WAS PREVIOUSLY 'received' or 'completed'
        IF (OLD.status = 'received' OR OLD.status = 'completed') THEN
            -- If old was NOT prepaid, it deducted from cash/bank
            IF (COALESCE(OLD.payment_method, 'cash') != 'prepaid' AND COALESCE(OLD.payment_method, 'cash') != 'credit' AND OLD.paid_amount > 0) THEN
                IF OLD.bank_account_id IS NOT NULL THEN
                    UPDATE public.accounts SET current_balance = current_balance + OLD.paid_amount WHERE id = OLD.bank_account_id;
                ELSIF OLD.payment_method = 'cash' THEN
                    UPDATE public.accounts SET current_balance = current_balance + OLD.paid_amount 
                    WHERE id = (
                        SELECT id FROM public.accounts 
                        WHERE account_type = 'cash' AND status = 'active' 
                        ORDER BY created_at ASC LIMIT 1
                    );
                END IF;

                UPDATE public.daily_balances 
                SET 
                    cash_closing = CASE WHEN OLD.payment_method = 'cash' THEN COALESCE(cash_closing, cash_opening) + OLD.paid_amount ELSE cash_closing END,
                    bank_closing = CASE WHEN OLD.payment_method IN ('bank', 'bank_transfer', 'cheque') THEN COALESCE(bank_closing, bank_opening) + OLD.paid_amount ELSE bank_closing END,
                    updated_at = NOW()
                WHERE balance_date = OLD.purchase_date;
            END IF;
        END IF;

        DELETE FROM public.transactions WHERE reference_id = OLD.id AND (reference_type = 'purchase_order' OR reference_type = 'purchase');
    END IF;

    -- [2] APPLY NEW IMPACT
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        -- Only apply account changes IF status is 'received' or 'completed'
        IF (NEW.status = 'received' OR NEW.status = 'completed') THEN
            -- Skip for Credit or Zero amount
            IF v_method != 'credit' AND v_amount > 0 THEN
                -- IF NOT PREPAID, handle Cash/Bank deduction
                IF NOT v_is_prepaid THEN
                    -- FIND DEFAULT ACCOUNT IF MISSING
                    IF v_account_id IS NULL THEN
                        SELECT id INTO v_account_id FROM public.accounts 
                        WHERE account_type = (CASE WHEN v_method IN ('bank', 'bank_transfer', 'cheque') THEN 'bank' ELSE 'cash' END) 
                        AND status = 'active'
                        ORDER BY created_at ASC LIMIT 1;
                    END IF;

                    IF v_account_id IS NOT NULL THEN
                        UPDATE public.accounts SET current_balance = current_balance - v_amount WHERE id = v_account_id;
                    END IF;

                    -- Update Daily Balances (Outflow)
                    UPDATE public.daily_balances 
                    SET 
                        cash_closing = CASE WHEN v_method = 'cash' THEN COALESCE(cash_closing, cash_opening) - v_amount ELSE cash_closing END,
                        bank_closing = CASE WHEN v_method IN ('bank', 'bank_transfer', 'cheque') THEN COALESCE(bank_closing, bank_opening) - v_amount ELSE bank_closing END,
                        updated_at = NOW()
                    WHERE balance_date = v_date;
                END IF;
            END IF;
        END IF;

        -- [3] LOG TRANSACTION (Always do this for audit trail, but with purchase-order status)
        INSERT INTO public.transactions (
            transaction_date, transaction_type, category, description, amount, 
            payment_method, 
            from_account, -- Will be NULL if prepaid
            reference_type, reference_id, bank_account_id, created_by,
            status -- [NEW] Propagate status
        ) VALUES (
            NOW(), 
            'expense', 
            'purchase', 
            'Purchase Order: ' || COALESCE(NEW.invoice_number, 'N/A') || (CASE WHEN v_is_prepaid THEN ' (Prepaid)' ELSE '' END), 
            v_amount, 
            (CASE WHEN v_method = 'cash' THEN 'cash' WHEN v_method = 'prepaid' THEN 'prepaid' ELSE 'bank_transfer' END), 
            v_account_id, 
            'purchase_order', 
            NEW.id, 
            v_account_id,
            NEW.created_by,
            NEW.status -- Map 'hold'/'scheduled'/'received' to transactions.status
        );
    END IF;

    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;

-- [4] RE-APPLY THE TRIGGER
DROP TRIGGER IF EXISTS trg_purchase_order_financials ON public.purchase_orders;
CREATE TRIGGER trg_purchase_order_financials 
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders 
FOR EACH ROW EXECUTE FUNCTION public.handle_purchase_order_financials();
