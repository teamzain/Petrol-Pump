-- Module 15 Fix: Robust Stock Movements & Balance Updates
-- 1. Improved Trigger Function for Sales
CREATE OR REPLACE FUNCTION public.handle_sale_sync_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_product_id UUID;
  v_qty_delta DECIMAL(15, 3);
  v_current_stock DECIMAL(15, 3);
  v_weighted_avg DECIMAL(15, 4);
  v_ref_id TEXT;
  v_recorded_by UUID;
BEGIN
    -- Determine target product and recording delta
    IF (TG_OP = 'DELETE') THEN
        v_product_id := OLD.product_id;
        v_qty_delta := OLD.quantity; -- Return stock
        v_ref_id := OLD.id::text;
        v_recorded_by := OLD.recorded_by;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_product_id := NEW.product_id;
        v_qty_delta := OLD.quantity - NEW.quantity; -- Delta: positive if reduced sale, negative if increased sale
        v_ref_id := NEW.id::text;
        v_recorded_by := NEW.recorded_by;
    ELSE -- INSERT
        v_product_id := NEW.product_id;
        v_qty_delta := -NEW.quantity; -- Pure stock out
        v_ref_id := NEW.id::text;
        v_recorded_by := NEW.recorded_by;
    END IF;

    -- Avoid noise for no-op updates
    IF v_qty_delta = 0 THEN
        RETURN NEW;
    END IF;

    -- 1. Atomic Update of the Product Balance and fetch the result
    UPDATE public.products
    SET current_stock = current_stock + v_qty_delta
    WHERE id = v_product_id
    RETURNING current_stock, weighted_avg_cost INTO v_current_stock, v_weighted_avg;

    -- 2. Log the Movement with the guaranteed correct balance_after
    INSERT INTO public.stock_movements (
        product_id,
        movement_type,
        quantity,
        unit_price,
        weighted_avg_after,
        balance_after,
        reference_type,
        reference_number,
        created_by,
        created_at,
        notes
    ) VALUES (
        v_product_id,
        'sale',
        v_qty_delta,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.selling_price ELSE NEW.selling_price END,
        v_weighted_avg,
        v_current_stock, -- Accurate balance after atomic update
        'sales',
        v_ref_id,
        v_recorded_by,
        NOW(),
        'System Sync (' || TG_OP || ')'
    );

    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

-- 2. Drop old trigger and apply new one
DROP TRIGGER IF EXISTS on_sale_created_stock_movement ON public.sales;
DROP TRIGGER IF EXISTS on_sale_sync_stock ON public.sales;

CREATE TRIGGER on_sale_sync_stock
  AFTER INSERT OR UPDATE OR DELETE ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_sale_sync_stock();
