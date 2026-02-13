-- 048_multi_bank_support.sql
-- This script implements multi-bank account management support.

-- 1. Update accounts table to support bank-specific fields
ALTER TABLE public.accounts 
ADD COLUMN IF NOT EXISTS account_number TEXT,
ADD COLUMN IF NOT EXISTS opening_balance DECIMAL(15, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive'));

-- 2. Add bank_account_id to transaction-related tables
-- Purchases
ALTER TABLE public.purchases 
ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES public.accounts(id);

-- Purchase Orders
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES public.accounts(id);

-- Sales
ALTER TABLE public.sales 
ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES public.accounts(id);

-- Nozzle Readings
ALTER TABLE public.nozzle_readings 
ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES public.accounts(id);

-- Expenses
ALTER TABLE public.expenses 
ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES public.accounts(id);

-- Transactions (already has to_account and from_account, but bank_account_id can be explicit)
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES public.accounts(id);

-- 3. Update handle_sale_financials to support multi-bank
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
BEGIN
    -- Prevent double counting for fuel sales in 'sales' table
    IF TG_TABLE_NAME = 'sales' THEN
        IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
            IF NEW.sale_type = 'fuel' THEN RETURN NEW; END IF;
        END IF;
        IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
            IF OLD.sale_type = 'fuel' THEN RETURN OLD; END IF;
        END IF;
    END IF;

    -- REVERSE OLD IMPACT
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        v_old_amount := OLD.sale_amount;
        
        IF TG_TABLE_NAME = 'nozzle_readings' THEN
            v_old_method := COALESCE(OLD.payment_method, 'cash');
            v_old_account_id := OLD.bank_account_id;
        ELSE
            v_old_method := OLD.payment_method;
            v_old_account_id := OLD.bank_account_id;
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

        -- Update daily_balances (aggregated)
        UPDATE public.daily_balances 
        SET 
            cash_closing = CASE WHEN v_old_method = 'cash' THEN COALESCE(cash_closing, cash_opening) - v_old_amount ELSE cash_closing END,
            bank_closing = CASE WHEN v_old_method != 'cash' THEN COALESCE(bank_closing, bank_opening) - v_old_amount ELSE bank_closing END
        WHERE balance_date = (CASE WHEN TG_TABLE_NAME = 'nozzle_readings' THEN OLD.reading_date ELSE OLD.sale_date END);

        DELETE FROM public.transactions WHERE reference_type = TG_TABLE_NAME AND reference_id = OLD.id;
    END IF;

    -- APPLY NEW IMPACT
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        v_amount := NEW.sale_amount;
        
        IF TG_TABLE_NAME = 'nozzle_readings' THEN
            v_method := COALESCE(NEW.payment_method, 'cash');
            v_account_id := NEW.bank_account_id;
        ELSE
            v_method := NEW.payment_method;
            v_account_id := NEW.bank_account_id;
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
            bank_closing = CASE WHEN v_method != 'cash' THEN COALESCE(bank_closing, bank_opening) + v_amount ELSE bank_closing END,
            updated_at = NOW()
        WHERE balance_date = (CASE WHEN TG_TABLE_NAME = 'nozzle_readings' THEN NEW.reading_date ELSE NEW.sale_date END);
        
        v_desc := (CASE WHEN TG_TABLE_NAME = 'nozzle_readings' THEN 'Fuel Sale' ELSE 'Product Sale' END) || ' (' || v_method || ')';
        v_tx_method := (CASE WHEN v_method = 'bank' THEN 'bank_transfer' ELSE v_method END);
        
        INSERT INTO public.transactions (
            transaction_date, transaction_type, category, description, amount, 
            payment_method, to_account, reference_type, reference_id, created_by, bank_account_id
        ) VALUES (
            NOW(), 'income', 'sale', v_desc, v_amount, v_tx_method, v_account_id, TG_TABLE_NAME, NEW.id, 
            (CASE WHEN TG_TABLE_NAME = 'nozzle_readings' THEN NEW.recorded_by ELSE NEW.recorded_by END), v_account_id
        );
    END IF;

    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;

-- 4. Update handle_expense_financials to support multi-bank
CREATE OR REPLACE FUNCTION public.handle_expense_financials()
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

    -- REVERSE OLD
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        v_old_amount := OLD.amount;
        v_old_method := OLD.payment_method;
        v_old_account_id := OLD.bank_account_id;
        
        IF v_old_account_id IS NULL THEN
            SELECT id INTO v_old_account_id FROM public.accounts 
            WHERE account_type = (CASE WHEN v_old_method = 'bank_transfer' OR v_old_method = 'cheque' THEN 'bank' ELSE 'cash' END) 
            ORDER BY created_at ASC LIMIT 1;
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

    -- APPLY NEW
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        v_amount := NEW.amount;
        v_method := NEW.payment_method;
        v_account_id := NEW.bank_account_id;
        
        IF v_account_id IS NULL THEN
            SELECT id INTO v_account_id FROM public.accounts 
            WHERE account_type = (CASE WHEN v_method = 'bank_transfer' OR v_method = 'cheque' THEN 'bank' ELSE 'cash' END) 
            ORDER BY created_at ASC LIMIT 1;
        END IF;
        
        IF v_account_id IS NULL THEN RAISE EXCEPTION 'No account found for payment method %', v_method; END IF;

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
            payment_method, from_account, reference_type, reference_id, created_by, bank_account_id
        ) VALUES (
            NEW.expense_date::timestamptz, 'expense', v_cat_name, v_desc, v_amount, v_method, v_account_id, 'expense', NEW.id, NEW.created_by, v_account_id
        );
    END IF;

    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;

-- 5. New Trigger for manual Transactions (Transfers, etc.)
CREATE OR REPLACE FUNCTION public.handle_manual_transaction_financials()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- This handles manual entries in the transactions table (like Cash to Bank transfers)
    -- that are NOT automated by other triggers (reference_type is NULL)
    IF NEW.reference_type IS NOT NULL THEN RETURN NEW; END IF;

    -- Update Source Account (Decrease)
    IF NEW.from_account IS NOT NULL THEN
        UPDATE public.accounts SET current_balance = current_balance - NEW.amount WHERE id = NEW.from_account;
    END IF;

    -- Update Destination Account (Increase)
    IF NEW.to_account IS NOT NULL THEN
        UPDATE public.accounts SET current_balance = current_balance + NEW.amount WHERE id = NEW.to_account;
    END IF;

    -- Impact on daily_balances should be handled carefully to avoid double counting
    -- Manual transfers between cash and bank:
    IF NEW.transaction_type = 'transfer' THEN
        DECLARE
            v_from_type TEXT;
            v_to_type TEXT;
        BEGIN
            SELECT account_type INTO v_from_type FROM public.accounts WHERE id = NEW.from_account;
            SELECT account_type INTO v_to_type FROM public.accounts WHERE id = NEW.to_account;

            UPDATE public.daily_balances 
            SET 
                cash_closing = CASE 
                    WHEN v_from_type = 'cash' THEN COALESCE(cash_closing, cash_opening) - NEW.amount 
                    WHEN v_to_type = 'cash' THEN COALESCE(cash_closing, cash_opening) + NEW.amount
                    ELSE cash_closing END,
                bank_closing = CASE 
                    WHEN v_from_type = 'bank' THEN COALESCE(bank_closing, bank_opening) - NEW.amount 
                    WHEN v_to_type = 'bank' THEN COALESCE(bank_closing, bank_opening) + NEW.amount
                    ELSE bank_closing END
            WHERE balance_date = NEW.transaction_date::DATE;
        END;
    END IF;

    RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_manual_transaction_financials ON public.transactions;
CREATE TRIGGER on_manual_transaction_financials 
BEFORE INSERT ON public.transactions 
FOR EACH ROW EXECUTE FUNCTION public.handle_manual_transaction_financials();
