-- Module 15: ULTIMATE ROBUST ROLLING STOCK
-- This script ensures a perfect chain-link sequence for every product.

-- 1. Ensure Schema column exists
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS previous_stock DECIMAL(15, 3) DEFAULT 0;

-- 2. Refined Sale Trigger (Strict Rolling Logic)
CREATE OR REPLACE FUNCTION public.handle_sale_sync_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_old_stock DECIMAL(15, 3);
  v_new_stock DECIMAL(15, 3);
  v_qty_delta DECIMAL(15, 3);
  v_avg_cost DECIMAL(15, 4);
BEGIN
    -- Determine the change from previous record state
    IF (TG_OP = 'DELETE') THEN v_qty_delta := OLD.quantity;
    ELSIF (TG_OP = 'UPDATE') THEN v_qty_delta := OLD.quantity - NEW.quantity;
    ELSE v_qty_delta := -NEW.quantity; END IF;

    IF v_qty_delta = 0 THEN RETURN NEW; END IF;

    -- ATOMIC STEP: Lock product, get EXACT current balance as Previous Stock
    SELECT current_stock, weighted_avg_cost INTO v_old_stock, v_avg_cost
    FROM public.products WHERE id = (CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END)
    FOR UPDATE;

    v_new_stock := v_old_stock + v_qty_delta;

    -- VALIDATION: Stop negative stock
    IF v_new_stock < 0 THEN
        RAISE EXCEPTION 'Insufficient stock. Product ID %, Available: %, Requested Change: %', 
            (CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END), v_old_stock, ABS(v_qty_delta);
    END IF;

    -- Persist Atomic Update
    UPDATE public.products SET current_stock = v_new_stock 
    WHERE id = (CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END);

    -- Log Movement with explicit rolling stock columns
    INSERT INTO public.stock_movements (
        product_id, movement_date, movement_type, quantity,
        previous_stock, balance_after, unit_price, weighted_avg_after,
        reference_type, reference_number, notes
    ) VALUES (
        CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END, NOW(), 'sale',
        ABS(v_qty_delta), v_old_stock, v_new_stock,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.selling_price ELSE NEW.selling_price END,
        v_avg_cost, 'sales', (CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END)::text,
        'System Sync (' || TG_OP || ')'
    );

    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;

-- 3. Refined Purchase Trigger (Strict Rolling Logic)
CREATE OR REPLACE FUNCTION public.handle_purchase_sync_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_old_stock DECIMAL(15, 3);
  v_new_stock DECIMAL(15, 3);
  v_qty_delta DECIMAL(15, 3);
  v_avg_cost DECIMAL(15, 4);
BEGIN
    IF (TG_OP = 'DELETE') THEN v_qty_delta := -OLD.quantity;
    ELSIF (TG_OP = 'UPDATE') THEN v_qty_delta := NEW.quantity - OLD.quantity;
    ELSE v_qty_delta := NEW.quantity; END IF;

    IF v_qty_delta = 0 THEN RETURN NEW; END IF;

    -- ATOMIC STEP
    SELECT current_stock, weighted_avg_cost INTO v_old_stock, v_avg_cost
    FROM public.products WHERE id = (CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END)
    FOR UPDATE;

    v_new_stock := v_old_stock + v_qty_delta;

    UPDATE public.products SET current_stock = v_new_stock 
    WHERE id = (CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END);

    INSERT INTO public.stock_movements (
        product_id, movement_date, movement_type, quantity,
        previous_stock, balance_after, unit_price, weighted_avg_after,
        reference_type, reference_number, notes
    ) VALUES (
        CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END, NOW(), 'purchase',
        ABS(v_qty_delta), v_old_stock, v_new_stock,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.purchase_price ELSE NEW.purchase_price END,
        v_avg_cost, 'purchases', (CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END)::text,
        'System Sync (' || TG_OP || ')'
    );

    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;
