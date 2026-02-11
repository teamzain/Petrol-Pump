-- 033_purchase_linkage_repair.sql
-- Goal: Definitively fix "0 Products" and "Bad Request" errors.

-- 1. Fix Purchases (Items) Table
-- Make invoice_number optional because we use order_id as the primary link
ALTER TABLE public.purchases ALTER COLUMN invoice_number DROP NOT NULL;

-- Drop the unique constraint that blocks multiple items with the same invoice
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.purchases'::regclass AND conname = 'purchases_invoice_number_key') THEN
        ALTER TABLE public.purchases DROP CONSTRAINT purchases_invoice_number_key;
    END IF;
EXCEPTION
    WHEN undefined_table THEN RAISE NOTICE 'purchases table not found';
END $$;

-- 2. Ensure order_id exists for linkage
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.purchase_orders(id) ON DELETE CASCADE;

-- 3. Fix Stock Movements Table
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS reference_id UUID;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS previous_stock DECIMAL(15, 3) DEFAULT 0;

-- 4. Re-Apply Universal Stock Sync Trigger
-- (Same robust logic from script 032 to ensure it's active)
CREATE OR REPLACE FUNCTION public.handle_universal_stock_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_old_stock DECIMAL(15, 3); v_new_stock DECIMAL(15, 3); v_qty_delta DECIMAL(15, 3); v_prod_id UUID;
    v_ref_type TEXT; v_ref_id UUID; v_ref_num TEXT; v_move_type TEXT; v_notes TEXT; v_unit_price DECIMAL(15, 2); v_weighted_avg DECIMAL(15, 4);
BEGIN
    IF (TG_OP = 'DELETE') THEN v_prod_id := OLD.product_id; v_qty_delta := CASE WHEN TG_TABLE_NAME = 'purchases' THEN -OLD.quantity ELSE OLD.quantity END; v_ref_id := OLD.id;
    ELSE v_prod_id := NEW.product_id; v_qty_delta := CASE WHEN TG_TABLE_NAME = 'purchases' THEN NEW.quantity ELSE -NEW.quantity END; v_ref_id := NEW.id; END IF;
    IF (TG_OP = 'UPDATE') THEN v_qty_delta := CASE WHEN TG_TABLE_NAME = 'purchases' THEN NEW.quantity - OLD.quantity ELSE OLD.quantity - NEW.quantity END; END IF;
    IF v_qty_delta = 0 THEN RETURN NEW; END IF;

    SELECT current_stock, weighted_avg_cost INTO v_old_stock, v_weighted_avg FROM public.products WHERE id = v_prod_id FOR UPDATE;
    v_new_stock := v_old_stock + v_qty_delta;
    IF v_new_stock < 0 AND v_qty_delta < 0 THEN RAISE EXCEPTION 'Insufficient Stock'; END IF;
    UPDATE public.products SET current_stock = v_new_stock, updated_at = NOW() WHERE id = v_prod_id;

    v_ref_type := CASE WHEN TG_TABLE_NAME = 'purchases' THEN 'purchase' WHEN TG_TABLE_NAME = 'nozzle_readings' THEN 'reading' ELSE 'sale' END;
    v_move_type := CASE WHEN v_qty_delta > 0 THEN 'purchase' ELSE 'sale' END;
    IF (TG_OP = 'DELETE') THEN v_notes := 'Deleted: ' || TG_TABLE_NAME; v_ref_num := 'DEL-' || OLD.id;
    ELSE v_unit_price := CASE WHEN TG_TABLE_NAME = 'purchases' THEN NEW.purchase_price_per_unit ELSE NEW.selling_price END;
         v_ref_num := CASE WHEN TG_TABLE_NAME = 'purchases' THEN COALESCE(NEW.invoice_number, 'PUR-'||NEW.id) ELSE 'TRX-'||NEW.id END;
         v_notes := 'Auto-Sync: ' || TG_TABLE_NAME;
    END IF;

    INSERT INTO public.stock_movements (product_id, movement_date, movement_type, quantity, previous_stock, balance_after, unit_price, weighted_avg_after, reference_type, reference_id, reference_number, notes)
    VALUES (v_prod_id, NOW(), v_move_type, ABS(v_qty_delta), v_old_stock, v_new_stock, v_unit_price, v_weighted_avg, v_ref_type, v_ref_id, v_ref_num, v_notes);
    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF; RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_universal_stock_sales ON public.sales;
CREATE TRIGGER trg_universal_stock_sales AFTER INSERT OR UPDATE OR DELETE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.handle_universal_stock_sync();
DROP TRIGGER IF EXISTS trg_universal_stock_readings ON public.nozzle_readings;
CREATE TRIGGER trg_universal_stock_readings AFTER INSERT OR UPDATE OR DELETE ON public.nozzle_readings FOR EACH ROW EXECUTE FUNCTION public.handle_universal_stock_sync();
DROP TRIGGER IF EXISTS trg_universal_stock_purchases ON public.purchases;
CREATE TRIGGER trg_universal_stock_purchases AFTER INSERT OR UPDATE OR DELETE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.handle_universal_stock_sync();
