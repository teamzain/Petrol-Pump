-- 064_multi_payment_support.sql
-- 1. Create Card Types table
CREATE TABLE IF NOT EXISTS public.card_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_name TEXT UNIQUE NOT NULL,
  tax_percentage DECIMAL(5, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default card types
INSERT INTO public.card_types (card_name, tax_percentage) VALUES
  ('Shell Card', 15.00),
  ('Bank Card', 0.00)
ON CONFLICT (card_name) DO NOTHING;

-- 2. Update sales and nozzle_readings to support card amounts
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS shell_card_amount DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS bank_card_amount DECIMAL(15, 2) DEFAULT 0;

ALTER TABLE public.nozzle_readings ADD COLUMN IF NOT EXISTS shell_card_amount DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE public.nozzle_readings ADD COLUMN IF NOT EXISTS bank_card_amount DECIMAL(15, 2) DEFAULT 0;

-- 3. Create Card Payments table for "hold" tracking
CREATE TABLE IF NOT EXISTS public.card_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  card_type_id UUID NOT NULL REFERENCES public.card_types(id),
  reference_type TEXT NOT NULL, -- 'sales' or 'nozzle_readings'
  reference_id UUID NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  tax_percentage DECIMAL(5, 2) NOT NULL,
  tax_amount DECIMAL(15, 2) NOT NULL,
  net_amount DECIMAL(15, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'hold' CHECK (status IN ('hold', 'received')),
  received_at TIMESTAMPTZ,
  bank_account_id UUID REFERENCES public.accounts(id), -- Destination account
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Enable RLS and add basic policies
ALTER TABLE public.card_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can view card types" ON public.card_types FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage card types" ON public.card_types FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Auth users can view card payments" ON public.card_payments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth users can manage card payments" ON public.card_payments FOR ALL USING (auth.uid() IS NOT NULL);

-- 5. Update handle_sale_financials trigger function
CREATE OR REPLACE FUNCTION public.handle_sale_financials_v2()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_account_id UUID;
  v_old_account_id UUID;
  v_method TEXT;
  v_old_method TEXT;
  v_amount DECIMAL(15, 2);
  v_old_amount DECIMAL(15, 2);
  v_cash_amount DECIMAL(15, 2);
  v_old_cash_amount DECIMAL(15, 2);
  v_shell_card DECIMAL(15, 2) := 0;
  v_bank_card DECIMAL(15, 2) := 0;
  v_old_shell_card DECIMAL(15, 2) := 0;
  v_old_bank_card DECIMAL(15, 2) := 0;
  v_date DATE;
  v_old_date DATE;
  v_recorded_by UUID;
  v_card_type_id UUID;
  v_tax_pct DECIMAL(5, 2);
BEGIN
    -- 1. PRE-CHECK: Prevent double counting for fuel sales in 'sales' table (they come from nozzle_readings usually)
    -- But note: some scripts insert into both. Script 103 handles this.
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
        v_old_shell_card := COALESCE(OLD.shell_card_amount, 0);
        v_old_bank_card := COALESCE(OLD.bank_card_amount, 0);
        
        IF TG_TABLE_NAME = 'nozzle_readings' THEN
            v_old_method := COALESCE(OLD.payment_method, 'cash');
            v_old_account_id := OLD.bank_account_id;
            v_old_date := OLD.reading_date;
        ELSE
            v_old_method := OLD.payment_method;
            v_old_account_id := OLD.bank_account_id;
            v_old_date := OLD.sale_date;
        END IF;

        -- If method is cash, the actual cash added was (amount - cards)
        IF v_old_method = 'cash' THEN
            v_old_cash_amount := v_old_amount - v_old_shell_card - v_old_bank_card;
        ELSE
            v_old_cash_amount := 0;
        END IF;
        
        -- Identify Account
        IF v_old_account_id IS NULL THEN
            SELECT id INTO v_old_account_id FROM public.accounts 
            WHERE account_type = (CASE WHEN v_old_method IN ('bank', 'bank_transfer', 'cheque') THEN 'bank' ELSE 'cash' END) 
            ORDER BY created_at ASC LIMIT 1;
        END IF;
        
        -- Reverse Account balance
        IF v_old_account_id IS NOT NULL THEN
            IF v_old_method = 'cash' THEN
                UPDATE public.accounts SET current_balance = current_balance - v_old_cash_amount WHERE id = v_old_account_id;
            ELSE
                UPDATE public.accounts SET current_balance = current_balance - v_old_amount WHERE id = v_old_account_id;
            END IF;
        END IF;

        -- Update daily_balances
        UPDATE public.daily_balances 
        SET 
            cash_closing = CASE WHEN v_old_method = 'cash' THEN COALESCE(cash_closing, cash_opening) - v_old_cash_amount ELSE cash_closing END,
            bank_closing = CASE WHEN v_old_method != 'cash' AND v_old_method != 'credit' THEN COALESCE(bank_closing, bank_opening) - v_old_amount ELSE bank_closing END,
            updated_at = NOW()
        WHERE balance_date = v_old_date;

        -- Delete card payments on hold
        DELETE FROM public.card_payments WHERE reference_type = TG_TABLE_NAME AND reference_id = OLD.id AND status = 'hold';
        -- Delete transactions
        DELETE FROM public.transactions WHERE reference_type = TG_TABLE_NAME AND reference_id = OLD.id;
    END IF;

    -- 3. APPLY NEW IMPACT
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        v_amount := NEW.sale_amount;
        v_shell_card := COALESCE(NEW.shell_card_amount, 0);
        v_bank_card := COALESCE(NEW.bank_card_amount, 0);
        
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

        IF v_method = 'cash' THEN
            v_cash_amount := v_amount - v_shell_card - v_bank_card;
        ELSE
            v_cash_amount := 0;
        END IF;
        
        -- Identify Account
        IF v_account_id IS NULL THEN
            SELECT id INTO v_account_id FROM public.accounts 
            WHERE account_type = (CASE WHEN v_method IN ('bank', 'bank_transfer', 'cheque') THEN 'bank' ELSE 'cash' END) 
            ORDER BY created_at ASC LIMIT 1;
        END IF;
        
        IF v_account_id IS NULL THEN 
            SELECT id INTO v_account_id FROM public.accounts WHERE account_type = 'cash' LIMIT 1;
        END IF;

        -- Update account
        IF v_method = 'cash' THEN
            UPDATE public.accounts SET current_balance = current_balance + v_cash_amount WHERE id = v_account_id;
        ELSE
            UPDATE public.accounts SET current_balance = current_balance + v_amount WHERE id = v_account_id;
        END IF;

        -- Update daily_balances
        UPDATE public.daily_balances 
        SET 
            cash_closing = CASE WHEN v_method = 'cash' THEN COALESCE(cash_closing, cash_opening) + v_cash_amount ELSE cash_closing END,
            bank_closing = CASE WHEN v_method != 'cash' AND v_method != 'credit' THEN COALESCE(bank_closing, bank_opening) + v_amount ELSE bank_closing END,
            updated_at = NOW()
        WHERE balance_date = v_date;
        
        -- Create record for Shell Card if any
        IF v_shell_card > 0 THEN
            SELECT id, tax_percentage INTO v_card_type_id, v_tax_pct FROM public.card_types WHERE card_name = 'Shell Card' LIMIT 1;
            IF v_card_type_id IS NOT NULL THEN
                INSERT INTO public.card_payments (
                    card_type_id, reference_type, reference_id, amount, tax_percentage, tax_amount, net_amount, status, created_by, payment_date
                ) VALUES (
                    v_card_type_id, TG_TABLE_NAME, NEW.id, v_shell_card, v_tax_pct, (v_shell_card * v_tax_pct / 100), v_shell_card - (v_shell_card * v_tax_pct / 100), 'hold', v_recorded_by, v_date
                );
            END IF;
        END IF;

        -- Create record for Bank Card if any
        IF v_bank_card > 0 THEN
            SELECT id, tax_percentage INTO v_card_type_id, v_tax_pct FROM public.card_types WHERE card_name = 'Bank Card' LIMIT 1;
            IF v_card_type_id IS NOT NULL THEN
                INSERT INTO public.card_payments (
                    card_type_id, reference_type, reference_id, amount, tax_percentage, tax_amount, net_amount, status, created_by, payment_date
                ) VALUES (
                    v_card_type_id, TG_TABLE_NAME, NEW.id, v_bank_card, v_tax_pct, (v_bank_card * v_tax_pct / 100), v_bank_card - (v_bank_card * v_tax_pct / 100), 'hold', v_recorded_by, v_date
                );
            END IF;
        END IF;
        
        -- Transactions record
        -- For cash sales, we record two transactions if cards are used? Or one transaction with the net?
        -- The user wants "deducted from cash but shown in total sales".
        -- Let's record the full amount as income, but maybe split it into Cash income and Card (Hold) income?
        -- Actually, for simplicity, let's record the full amount in transactions but adjust the 'to_account' logic?
        -- If we record it in transactions, it will show up in reports.
        
        INSERT INTO public.transactions (
            transaction_date, transaction_type, category, description, amount, 
            payment_method, to_account, reference_type, reference_id, created_by, bank_account_id
        ) VALUES (
            NOW(), 'income', 'sale', 
            (CASE WHEN TG_TABLE_NAME = 'nozzle_readings' THEN 'Fuel Sale' ELSE 'Product Sale' END) || ' (Total' || 
            (CASE WHEN v_shell_card > 0 THEN ', Shell Card: ' || v_shell_card ELSE '' END) || 
            (CASE WHEN v_bank_card > 0 THEN ', Bank Card: ' || v_bank_card ELSE '' END) || ')',
            v_amount, v_method, v_account_id, TG_TABLE_NAME, NEW.id, 
            v_recorded_by, v_account_id
        );
    END IF;

    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;

-- Drop old trigger and create new one
DROP TRIGGER IF EXISTS on_sale_financials ON public.sales;
CREATE TRIGGER on_sale_financials 
AFTER INSERT OR UPDATE OR DELETE ON public.sales 
FOR EACH ROW EXECUTE FUNCTION public.handle_sale_financials_v2();

DROP TRIGGER IF EXISTS on_reading_financials ON public.nozzle_readings;
CREATE TRIGGER on_reading_financials 
AFTER INSERT OR UPDATE OR DELETE ON public.nozzle_readings 
FOR EACH ROW EXECUTE FUNCTION public.handle_sale_financials_v2();
