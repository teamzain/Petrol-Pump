-- 032_fix_stock_movement_id_column.sql
-- Goal: Fix 400 Bad Request by adding missing reference_id column to stock_movements

-- 1. Add missing column for reference UUID
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS reference_id UUID;

-- 2. RE-RUN THE UNIVERSAL TRIGGER WITH CORRECTED SCHEMA
-- This ensures all columns match the table.

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
    -- Determine Product ID and Delta
    IF (TG_OP = 'DELETE') THEN
        v_prod_id := OLD.product_id;
        v_qty_delta := CASE 
            WHEN TG_TABLE_NAME = 'purchases' THEN -OLD.quantity 
            ELSE OLD.quantity -- Sale deletion adds stock back
        END;
        v_ref_id := OLD.id;
    ELSE
        v_prod_id := NEW.product_id;
        v_qty_delta := CASE 
            WHEN TG_TABLE_NAME = 'purchases' THEN NEW.quantity 
            ELSE -NEW.quantity -- Sale insertion removes stock
        END;
        v_ref_id := NEW.id;
    END IF;

    -- Update Delta for UPDATE operations
    IF (TG_OP = 'UPDATE') THEN
        v_qty_delta := CASE 
            WHEN TG_TABLE_NAME = 'purchases' THEN NEW.quantity - OLD.quantity
            ELSE OLD.quantity - NEW.quantity
        END;
    END IF;

    -- If no change, return
    IF v_qty_delta = 0 THEN RETURN NEW; END IF;

    -- ATOMIC LOCK AND SYNC
    SELECT current_stock, weighted_avg_cost INTO v_old_stock, v_weighted_avg
    FROM public.products 
    WHERE id = v_prod_id FOR UPDATE;

    v_new_stock := v_old_stock + v_qty_delta;

    -- Insufficient stock check for sales
    IF v_new_stock < 0 AND v_qty_delta < 0 THEN
        RAISE EXCEPTION 'Insufficient stock for product. Available: %, Required: %', v_old_stock, ABS(v_qty_delta);
    END IF;

    -- Capture Unit Price if available
    IF (TG_OP != 'DELETE') THEN
        IF TG_TABLE_NAME = 'nozzle_readings' THEN 
            v_unit_price := NEW.selling_price;
        ELSIF TG_TABLE_NAME = 'purchases' THEN 
            v_unit_price := NEW.purchase_price_per_unit;
        ELSE 
            v_unit_price := NEW.selling_price;
        END IF;
    END IF;

    -- Update Product Balance
    UPDATE public.products 
    SET current_stock = v_new_stock,
        updated_at = NOW()
    WHERE id = v_prod_id;

    -- Determine Movement Details
    v_ref_type := CASE 
        WHEN TG_TABLE_NAME = 'purchases' THEN 'purchase'
        WHEN TG_TABLE_NAME = 'nozzle_readings' THEN 'reading'
        ELSE 'sale'
    END;

    v_move_type := CASE 
        WHEN v_qty_delta > 0 THEN 'purchase' 
        ELSE 'sale' 
    END;

    IF (TG_OP = 'DELETE') THEN
        v_notes := 'Record Deleted (' || TG_TABLE_NAME || ')';
        v_ref_num := 'DEL-' || OLD.id;
    ELSE
        IF TG_TABLE_NAME = 'nozzle_readings' THEN
            v_notes := 'Fuel Reading Sale';
            v_ref_num := 'READ-' || NEW.id;
        ELSIF TG_TABLE_NAME = 'purchases' THEN
            v_notes := 'Purchase';
            v_ref_num := COALESCE(NEW.invoice_number, 'PUR-' || NEW.id);
        ELSE
            v_notes := 'Product Sale (' || COALESCE(NEW.sale_type, 'pos') || ')';
            v_ref_num := 'SALE-' || NEW.id;
        END IF;
    END IF;

    -- Record Movement
    INSERT INTO public.stock_movements (
        product_id,
        movement_date,
        movement_type,
        quantity,
        previous_stock,
        balance_after,
        unit_price,
        weighted_avg_after,
        reference_type,
        reference_id,
        reference_number,
        notes
    ) VALUES (
        v_prod_id,
        NOW(),
        v_move_type,
        ABS(v_qty_delta),
        v_old_stock,
        v_new_stock,
        v_unit_price,
        v_weighted_avg,
        v_ref_type,
        v_ref_id,
        v_ref_num,
        v_notes
    );

    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;
