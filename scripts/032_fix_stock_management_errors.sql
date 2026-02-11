-- 032_fix_stock_management_errors.sql
-- Goal: Fix 400 Bad Request on purchases and ensure sequential stock flow.

-- 1. DROP PROBLEMATIC UNIQUE CONSTRAINT ON PURCHASES (Items)
-- Items in a single order share the same invoice number, so it CANNOT be unique in the items table.
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.purchases'::regclass AND conname = 'purchases_invoice_number_key') THEN
        ALTER TABLE public.purchases DROP CONSTRAINT purchases_invoice_number_key;
    END IF;
END $$;

-- 2. ADD MISSING COLUMNS TO STOCK_MOVEMENTS
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS reference_id UUID;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS previous_stock DECIMAL(15, 3) DEFAULT 0;

-- 3. RE-IMPLEMENT UNIVERSAL TRIGGER (FIXED)
CREATE OR REPLACE FUNCTION public.handle_universal_stock_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_old_stock DECIMAL(15, 3);
    v_new_stock DECIMAL(15, 3);
    v_qty_delta DECIMAL(15, 3);
    v_prod_id UUID;
    v_ref_type TEXT;
    v_ref_id UUID;
    v_ref_num TEXT;
    v_move_type TEXT;
    v_notes TEXT;
    v_unit_price DECIMAL(15, 2);
    v_weighted_avg DECIMAL(15, 4);
BEGIN
    -- Determine Context
    IF (TG_OP = 'DELETE') THEN
        v_prod_id := OLD.product_id;
        v_qty_delta := CASE WHEN TG_TABLE_NAME = 'purchases' THEN -OLD.quantity ELSE OLD.quantity END;
        v_ref_id := OLD.id;
    ELSE
        v_prod_id := NEW.product_id;
        v_qty_delta := CASE WHEN TG_TABLE_NAME = 'purchases' THEN NEW.quantity ELSE -NEW.quantity END;
        v_ref_id := NEW.id;
    END IF;

    IF (TG_OP = 'UPDATE') THEN
        v_qty_delta := CASE WHEN TG_TABLE_NAME = 'purchases' THEN NEW.quantity - OLD.quantity ELSE OLD.quantity - NEW.quantity END;
    END IF;

    IF v_qty_delta = 0 THEN RETURN NEW; END IF;

    -- ATOMIC LOCK
    SELECT current_stock, weighted_avg_cost INTO v_old_stock, v_weighted_avg
    FROM public.products WHERE id = v_prod_id FOR UPDATE;

    v_new_stock := v_old_stock + v_qty_delta;

    -- VALIDATE
    IF v_new_stock < 0 AND v_qty_delta < 0 THEN
        RAISE EXCEPTION 'Insufficient Stock. Product: %, Current: %, Wanted: %', v_prod_id, v_old_stock, ABS(v_qty_delta);
    END IF;

    -- UPDATE STOCK
    UPDATE public.products SET current_stock = v_new_stock, updated_at = NOW() WHERE id = v_prod_id;

    -- LOG MOVEMENT
    v_ref_type := CASE WHEN TG_TABLE_NAME = 'purchases' THEN 'purchase' WHEN TG_TABLE_NAME = 'nozzle_readings' THEN 'reading' ELSE 'sale' END;
    v_move_type := CASE WHEN v_qty_delta > 0 THEN 'purchase' ELSE 'sale' END;

    IF (TG_OP = 'DELETE') THEN
        v_notes := 'Deleted: ' || TG_TABLE_NAME;
        v_ref_num := 'DEL-' || OLD.id;
    ELSE
        v_unit_price := CASE 
            WHEN TG_TABLE_NAME = 'purchases' THEN NEW.purchase_price_per_unit 
            ELSE NEW.selling_price 
        END;
        v_ref_num := CASE 
            WHEN TG_TABLE_NAME = 'purchases' THEN COALESCE(NEW.invoice_number, 'PUR-'||NEW.id)
            WHEN TG_TABLE_NAME = 'nozzle_readings' THEN 'READ-'||NEW.id
            ELSE 'SALE-'||NEW.id
        END;
        v_notes := 'Auto-Sync: ' || TG_TABLE_NAME;
    END IF;

    INSERT INTO public.stock_movements (
        product_id, movement_date, movement_type, quantity, previous_stock, balance_after,
        unit_price, weighted_avg_after, reference_type, reference_id, reference_number, notes
    ) VALUES (
        v_prod_id, NOW(), v_move_type, ABS(v_qty_delta), v_old_stock, v_new_stock,
        v_unit_price, v_weighted_avg, v_ref_type, v_ref_id, v_ref_num, v_notes
    );

    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;
