-- 034_nuclear_trigger_cleanup_and_repair.sql
-- Goal: Drop ALL legacy triggers and install the CORRECTED Universal Sync Engine.

-- 1. DROP ALL POTENTIAL LEGACY TRIGGERS
DROP TRIGGER IF EXISTS on_sale_sync_stock ON public.sales;
DROP TRIGGER IF EXISTS on_purchase_sync_stock ON public.purchases;
DROP TRIGGER IF EXISTS handle_stock_sync_trigger ON public.sales;
DROP TRIGGER IF EXISTS trg_universal_stock_sales ON public.sales;
DROP TRIGGER IF EXISTS trg_universal_stock_readings ON public.nozzle_readings;
DROP TRIGGER IF EXISTS trg_universal_stock_purchases ON public.purchases;

-- 2. DROP ALL POTENTIAL LEGACY FUNCTIONS
DROP FUNCTION IF EXISTS public.handle_sale_sync_stock();
DROP FUNCTION IF EXISTS public.handle_purchase_sync_stock();
DROP FUNCTION IF EXISTS public.handle_universal_stock_sync();

-- 3. RE-INSTALL CORRECTED UNIVERSAL STOCK ENGINE
-- This version is 100% safe for all tables.
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
    -- STEP 1: Determine Product ID and Quantity Change
    IF (TG_OP = 'DELETE') THEN
        v_prod_id := OLD.product_id;
        v_ref_id := OLD.id;
        v_qty_delta := CASE 
            WHEN TG_TABLE_NAME = 'purchases' THEN -OLD.quantity 
            ELSE OLD.quantity 
        END;
    ELSE
        v_prod_id := NEW.product_id;
        v_ref_id := NEW.id;
        v_qty_delta := CASE 
            WHEN TG_TABLE_NAME = 'purchases' THEN NEW.quantity 
            ELSE -NEW.quantity 
        END;
    END IF;

    -- Handle UPDATE delta
    IF (TG_OP = 'UPDATE') THEN
        v_qty_delta := CASE 
            WHEN TG_TABLE_NAME = 'purchases' THEN NEW.quantity - OLD.quantity
            ELSE OLD.quantity - NEW.quantity
        END;
    END IF;

    IF v_qty_delta = 0 THEN RETURN NEW; END IF;

    -- STEP 2: Atomic Lock and Balance Retrieval
    SELECT current_stock, weighted_avg_cost INTO v_old_stock, v_weighted_avg
    FROM public.products WHERE id = v_prod_id FOR UPDATE;

    v_new_stock := v_old_stock + v_qty_delta;

    -- STEP 3: Security Check (No negative stock for sales)
    IF v_new_stock < 0 AND v_qty_delta < 0 THEN
        RAISE EXCEPTION 'Insufficient stock. Table: %, Product: %, Current: %, Wanted: %', 
            TG_TABLE_NAME, v_prod_id, v_old_stock, ABS(v_qty_delta);
    END IF;

    -- STEP 4: Update Global Inventory
    UPDATE public.products 
    SET current_stock = v_new_stock,
        updated_at = NOW()
    WHERE id = v_prod_id;

    -- STEP 5: Prepare Movement Log Details (Table-Specific)
    v_ref_type := CASE 
        WHEN TG_TABLE_NAME = 'purchases' THEN 'purchase'
        WHEN TG_TABLE_NAME = 'nozzle_readings' THEN 'reading'
        ELSE 'sale'
    END;

    v_move_type := CASE 
        WHEN v_qty_delta > 0 THEN 'purchase' 
        ELSE 'sale' 
    END;

    -- Capture Unit Price and Invoice Logic
    IF (TG_OP = 'DELETE') THEN
        v_notes := 'Deleted Record (' || TG_TABLE_NAME || ')';
        v_ref_num := 'DEL-' || OLD.id;
        -- Use appropriate price column for OLD record
        IF TG_TABLE_NAME = 'purchases' THEN v_unit_price := OLD.purchase_price_per_unit;
        ELSE v_unit_price := OLD.selling_price; END IF;
    ELSE
        v_notes := 'Auto-Sync (' || TG_TABLE_NAME || ')';
        -- Use appropriate price column for NEW record
        IF TG_TABLE_NAME = 'purchases' THEN 
            v_unit_price := NEW.purchase_price_per_unit;
            v_ref_num := COALESCE(NEW.invoice_number, 'PUR-' || NEW.id);
        ELSE 
            v_unit_price := NEW.selling_price;
            v_ref_num := 'TRX-' || NEW.id;
        END IF;
    END IF;

    -- STEP 6: Insert into stock_movements (Sequential Flow)
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

-- 4. RE-APPLY THE ONE TRUE TRIGGER
CREATE TRIGGER trg_universal_stock_sales 
AFTER INSERT OR UPDATE OR DELETE ON public.sales 
FOR EACH ROW EXECUTE FUNCTION public.handle_universal_stock_sync();

CREATE TRIGGER trg_universal_stock_readings 
AFTER INSERT OR UPDATE OR DELETE ON public.nozzle_readings 
FOR EACH ROW EXECUTE FUNCTION public.handle_universal_stock_sync();

CREATE TRIGGER trg_universal_stock_purchases 
AFTER INSERT OR UPDATE OR DELETE ON public.purchases 
FOR EACH ROW EXECUTE FUNCTION public.handle_universal_stock_sync();
