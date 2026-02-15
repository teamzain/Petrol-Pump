-- 054_fix_opening_balance_sync.sql
-- Fixes sync_account_opening_with_daily_balances to handle missing today's record (UPSERT)
-- and ensures opening_balance correctly affects both opening and closing on the first day.

CREATE OR REPLACE FUNCTION public.sync_account_opening_with_daily_balances()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Karachi')::DATE;
    v_delta DECIMAL(15, 2);
BEGIN
    -- Calculate difference in opening balance
    v_delta := NEW.opening_balance - COALESCE(OLD.opening_balance, 0);
    
    -- If no change, do nothing
    IF v_delta = 0 AND TG_OP = 'UPDATE' THEN RETURN NEW; END IF;
    -- For INSERT, use the full NEW.opening_balance as delta if OLD is null
    IF TG_OP = 'INSERT' THEN v_delta := NEW.opening_balance; END IF;

    -- Upsert today's record
    -- We use ON CONFLICT to either update existing or insert new
    INSERT INTO public.daily_balances (
        balance_date, 
        cash_opening, 
        bank_opening, 
        cash_closing, 
        bank_closing,
        is_closed
    ) VALUES (
        v_today,
        CASE WHEN NEW.account_type = 'cash' THEN v_delta ELSE 0 END,
        CASE WHEN NEW.account_type = 'bank' THEN v_delta ELSE 0 END,
        CASE WHEN NEW.account_type = 'cash' THEN v_delta ELSE 0 END,
        CASE WHEN NEW.account_type = 'bank' THEN v_delta ELSE 0 END,
        FALSE
    )
    ON CONFLICT (balance_date) DO UPDATE SET
        cash_opening = CASE 
            WHEN NEW.account_type = 'cash' THEN public.daily_balances.cash_opening + EXCLUDED.cash_opening 
            ELSE public.daily_balances.cash_opening END,
        bank_opening = CASE 
            WHEN NEW.account_type = 'bank' THEN public.daily_balances.bank_opening + EXCLUDED.bank_opening 
            ELSE public.daily_balances.bank_opening END,
        cash_closing = CASE 
            WHEN NEW.account_type = 'cash' THEN public.daily_balances.cash_closing + EXCLUDED.cash_closing 
            ELSE public.daily_balances.cash_closing END,
        bank_closing = CASE 
            WHEN NEW.account_type = 'bank' THEN public.daily_balances.bank_closing + EXCLUDED.bank_closing 
            ELSE public.daily_balances.bank_closing END,
        updated_at = NOW();

    -- Also update current_balance to match opening_balance on INSERT if not already set
    -- (This helps when adding a new account through settings)
    IF TG_OP = 'INSERT' AND NEW.current_balance = 0 THEN
        UPDATE public.accounts SET current_balance = NEW.opening_balance WHERE id = NEW.id;
    END IF;

    RETURN NEW;
END; $$;

-- Re-apply trigger to be safe
DROP TRIGGER IF EXISTS trg_sync_account_opening ON public.accounts;
CREATE TRIGGER trg_sync_account_opening 
AFTER INSERT OR UPDATE OF opening_balance ON public.accounts 
FOR EACH ROW EXECUTE FUNCTION public.sync_account_opening_with_daily_balances();
