-- Module 15: Robust Stock Management (Atomic & Validated)

-- 1. Add previous_stock column to stock_movements
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS previous_stock DECIMAL(15, 3) DEFAULT 0;

-- 2. Enhanced Trigger Function for Sales (Atomic with Validation)
CREATE OR REPLACE FUNCTION public.handle_sale_sync_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_qty_delta DECIMAL(15, 3);
  v_new_stock DECIMAL(15, 3);
  v_old_stock DECIMAL(15, 3);
  v_weighted_avg DECIMAL(15, 4);
BEGIN
    -- QUANTITY in sales is stored as POSITIVE, but it's a SALE (Stock OUT)
    IF (TG_OP = 'DELETE') THEN
        v_qty_delta := OLD.quantity; -- Return stock
    ELSIF (TG_OP = 'UPDATE') THEN
        v_qty_delta := OLD.quantity - NEW.quantity; -- positive if reduced sale, negative if increased sale
    ELSE -- INSERT
        v_qty_delta := -NEW.quantity; -- Stock out
    END IF;

    -- Avoid noise for no-op updates
    IF v_qty_delta = 0 THEN RETURN NEW; END IF;

    -- 1. Atomic Transaction: Sequential Stock Flow
    -- We lock the product record and fetch the LATEST balance.
    -- v_old_stock = The 'Current Stock' of the PREVIOUS transaction.
    -- v_new_stock = The 'Current Stock' for THIS transaction.
    UPDATE public.products
    SET current_stock = current_stock + v_qty_delta
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END
    RETURNING current_stock, current_stock - v_qty_delta, weighted_avg_cost INTO v_new_stock, v_old_stock, v_weighted_avg;

    -- 2. Validate sufficient stock for Sales (ONLY for Insert/Increase)
    IF v_new_stock < 0 THEN
        RAISE EXCEPTION 'Insufficient stock for product ID %. Current: %, Requested: %', 
            NEW.product_id, v_old_stock, (CASE WHEN TG_OP = 'UPDATE' THEN NEW.quantity ELSE NEW.quantity END);
    END IF;

    -- 3. Log the Movement with Absolute Change
    INSERT INTO public.stock_movements (
        product_id,
        movement_date,
        movement_type,
        quantity, -- Store as absolute positive number
        previous_stock,
        balance_after,
        unit_price,
        weighted_avg_after,
        reference_type,
        reference_number,
        created_by,
        notes
    ) VALUES (
        CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END,
        NOW(),
        'sale',
        ABS(v_qty_delta), -- Change as positive number
        v_old_stock,
        v_new_stock,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.selling_price ELSE NEW.selling_price END,
        v_weighted_avg,
        'sales',
        (CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END)::text,
        (CASE WHEN TG_OP = 'DELETE' THEN OLD.recorded_by ELSE NEW.recorded_by END),
        'System Sync (' || TG_OP || ')'
    );

    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

-- 3. Trigger for Purchases (Stock IN)
CREATE OR REPLACE FUNCTION public.handle_purchase_sync_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_qty_delta DECIMAL(15, 3);
  v_new_stock DECIMAL(15, 3);
  v_old_stock DECIMAL(15, 3);
  v_weighted_avg DECIMAL(15, 4);
BEGIN
    IF (TG_OP = 'DELETE') THEN
        v_qty_delta := -OLD.quantity; -- Remove added stock
    ELSIF (TG_OP = 'UPDATE') THEN
        v_qty_delta := NEW.quantity - OLD.quantity;
    ELSE -- INSERT
        v_qty_delta := NEW.quantity;
    END IF;

    IF v_qty_delta = 0 THEN RETURN NEW; END IF;

    -- Update balance
    UPDATE public.products
    SET current_stock = current_stock + v_qty_delta
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END
    RETURNING current_stock, current_stock - v_qty_delta, weighted_avg_cost INTO v_new_stock, v_old_stock, v_weighted_avg;

    -- Log movement
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
        reference_number,
        created_by,
        notes
    ) VALUES (
        CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END,
        NOW(),
        'purchase',
        ABS(v_qty_delta),
        v_old_stock,
        v_new_stock,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.purchase_price ELSE NEW.purchase_price END,
        v_weighted_avg,
        'purchases',
        (CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END)::text,
        NULL, -- Could track creator if column exists
        'System Sync (' || TG_OP || ')'
    );

    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

-- 4. Apply Triggers
DROP TRIGGER IF EXISTS on_sale_sync_stock ON public.sales;
CREATE TRIGGER on_sale_sync_stock
  AFTER INSERT OR UPDATE OR DELETE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.handle_sale_sync_stock();

DROP TRIGGER IF EXISTS on_purchase_sync_stock ON public.purchases;
CREATE TRIGGER on_purchase_sync_stock
  AFTER INSERT OR UPDATE OR DELETE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.handle_purchase_sync_stock();
