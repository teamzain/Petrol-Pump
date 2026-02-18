-- 068_fix_sales_trigger_v4_robustness.sql
-- 1. Improved null handling for JSONB card breakdown
-- 2. Filtering for active accounts only
-- 3. Corrected transaction records to show only cash portion on cash accounts

CREATE OR REPLACE FUNCTION public.handle_sale_financials_v3()
RETURNS TRIGGER AS $$
DECLARE
    v_old_amount DECIMAL(15,2);
    v_old_total_card DECIMAL(15,2);
    v_old_cash_amount DECIMAL(15,2);
    v_old_method TEXT;
    v_old_account_id UUID;
    v_old_date DATE;
    
    v_amount DECIMAL(15,2);
    v_total_card DECIMAL(15,2);
    v_cash_amount DECIMAL(15,2);
    v_method TEXT;
    v_account_id UUID;
    v_date DATE;
    v_recorded_by UUID;
    
    v_card_type_id UUID;
    v_tax_pct DECIMAL(5,2);
    v_card_rec RECORD;
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
        v_old_amount := COALESCE(OLD.sale_amount, 0);
        v_old_total_card := COALESCE(OLD.total_card_amount, 0);
        
        IF TG_TABLE_NAME = 'nozzle_readings' THEN
            v_old_method := COALESCE(OLD.payment_method, 'cash');
            v_old_account_id := OLD.bank_account_id;
            v_old_date := OLD.reading_date;
        ELSE
            v_old_method := OLD.payment_method;
            v_old_account_id := OLD.bank_account_id;
            v_old_date := OLD.sale_date;
        END IF;

        IF v_old_method = 'cash' THEN
            v_old_cash_amount := v_old_amount - v_old_total_card;
        ELSE
            v_old_cash_amount := 0;
        END IF;
        
        -- Identify Account (must be active if possible, fallback to old one if we have the ID)
        IF v_old_account_id IS NULL THEN
            SELECT id INTO v_old_account_id FROM public.accounts 
            WHERE account_type = (CASE WHEN v_old_method IN ('bank', 'bank_transfer', 'cheque') THEN 'bank' ELSE 'cash' END)
            AND status = 'active'
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

        -- Delete card payments and transactions
        DELETE FROM public.card_payments WHERE reference_type = TG_TABLE_NAME AND reference_id = OLD.id AND status = 'hold';
        DELETE FROM public.transactions WHERE reference_type = TG_TABLE_NAME AND reference_id = OLD.id;
    END IF;

    -- 3. APPLY NEW IMPACT
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        v_amount := COALESCE(NEW.sale_amount, 0);
        
        -- Robust calculation of total card amount from JSONB
        IF NEW.card_breakdown IS NOT NULL AND NEW.card_breakdown != '{}'::jsonb THEN
            SELECT COALESCE(SUM(value::text::decimal), 0) INTO v_total_card 
            FROM jsonb_each(NEW.card_breakdown);
        ELSE
            v_total_card := COALESCE(NEW.total_card_amount, 0);
        END IF;
        
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
            v_cash_amount := v_amount - v_total_card;
        ELSE
            v_cash_amount := 0;
        END IF;
        
        -- Identify Active Account
        IF v_account_id IS NULL THEN
            SELECT id INTO v_account_id FROM public.accounts 
            WHERE account_type = (CASE WHEN v_method IN ('bank', 'bank_transfer', 'cheque') THEN 'bank' ELSE 'cash' END) 
            AND status = 'active'
            ORDER BY created_at ASC LIMIT 1;
        END IF;
        
        -- Final fallback if no active account found
        IF v_account_id IS NULL THEN 
            SELECT id INTO v_account_id FROM public.accounts WHERE account_type = 'cash' AND status = 'active' LIMIT 1;
        END IF;

        -- Update account
        IF v_account_id IS NOT NULL THEN
            IF v_method = 'cash' THEN
                UPDATE public.accounts SET current_balance = current_balance + v_cash_amount WHERE id = v_account_id;
            ELSE
                UPDATE public.accounts SET current_balance = current_balance + v_amount WHERE id = v_account_id;
            END IF;
        END IF;

        -- Update daily_balances
        UPDATE public.daily_balances 
        SET 
            cash_closing = CASE WHEN v_method = 'cash' THEN COALESCE(cash_closing, cash_opening) + v_cash_amount ELSE cash_closing END,
            bank_closing = CASE WHEN v_method != 'cash' AND v_method != 'credit' THEN COALESCE(bank_closing, bank_opening) + v_amount ELSE bank_closing END,
            updated_at = NOW()
        WHERE balance_date = v_date;
        
        -- Create record for each card in the breakdown
        IF NEW.card_breakdown IS NOT NULL AND NEW.card_breakdown != '{}'::jsonb THEN
            FOR v_card_rec IN SELECT key as id, value::text::decimal as amt FROM jsonb_each(NEW.card_breakdown) LOOP
                SELECT tax_percentage INTO v_tax_pct FROM public.card_types WHERE id = (v_card_rec.id)::uuid;
                IF v_tax_pct IS NOT NULL AND v_card_rec.amt > 0 THEN
                    INSERT INTO public.card_payments (
                        card_type_id, reference_type, reference_id, amount, tax_percentage, tax_amount, net_amount, status, created_by, payment_date
                    ) VALUES (
                        (v_card_rec.id)::uuid, TG_TABLE_NAME, NEW.id, v_card_rec.amt, v_tax_pct, 
                        (v_card_rec.amt * v_tax_pct / 100), 
                        v_card_rec.amt - (v_card_rec.amt * v_tax_pct / 100), 
                        'hold', v_recorded_by, v_date
                    );
                END IF;
            END LOOP;
        END IF;
        
        -- Transactions record: Match the actual cash impact for Cash accounts
        -- Product Sales always use the to_account if specified, otherwise the default.
        INSERT INTO public.transactions (
            transaction_date, transaction_type, category, description, amount, 
            payment_method, to_account, reference_type, reference_id, created_by, bank_account_id
        ) VALUES (
            NOW(), 'income', 'sale', 
            (CASE WHEN TG_TABLE_NAME = 'nozzle_readings' THEN 'Fuel Sale' ELSE 'Product Sale' END) || 
            (CASE WHEN v_total_card > 0 THEN ' (Cash Portion)' ELSE '' END) || 
            (CASE WHEN v_total_card > 0 THEN ', Card Payments: ' || v_total_card ELSE '' END),
            (CASE WHEN v_method = 'cash' THEN v_cash_amount ELSE v_amount END), 
            v_method, v_account_id, TG_TABLE_NAME, NEW.id, 
            v_recorded_by, v_account_id
        );
    END IF;

    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;
