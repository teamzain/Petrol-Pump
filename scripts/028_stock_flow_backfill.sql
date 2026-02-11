-- Module 15: Stock History Backfill & Perfect Flow
-- This script populates the 'previous_stock' column for all old records 
-- so that the UI can show the correct sequential flow.

UPDATE public.stock_movements
SET previous_stock = balance_after - (
    CASE 
        WHEN movement_type = 'purchase' THEN ABS(quantity)
        WHEN movement_type = 'sale' THEN -ABS(quantity)
        ELSE quantity -- Use raw for adjustments/initial
    END
)
WHERE previous_stock = 0 OR previous_stock IS NULL;

-- Also, let's fix the trigger to ensure it's absolutely robust for future updates
CREATE OR REPLACE FUNCTION public.handle_sale_sync_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_qty_delta DECIMAL(15, 3); v_new_stock DECIMAL(15, 3);
  v_old_stock DECIMAL(15, 3); v_weighted_avg DECIMAL(15, 4);
BEGIN
    -- 1. Determine direction
    IF (TG_OP = 'DELETE') THEN v_qty_delta := OLD.quantity;
    ELSIF (TG_OP = 'UPDATE') THEN v_qty_delta := OLD.quantity - NEW.quantity;
    ELSE v_qty_delta := -NEW.quantity; END IF;

    IF v_qty_delta = 0 THEN RETURN NEW; END IF;

    -- 2. Atomic Update (Sequential)
    UPDATE public.products SET current_stock = current_stock + v_qty_delta
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END
    RETURNING current_stock, current_stock - v_qty_delta, weighted_avg_cost INTO v_new_stock, v_old_stock, v_weighted_avg;

    IF v_new_stock < 0 THEN RAISE EXCEPTION 'Insufficient stock'; END IF;

    -- 3. Record the Movement
    INSERT INTO public.stock_movements (
        product_id, movement_date, movement_type, quantity, previous_stock, balance_after,
        unit_price, weighted_avg_after, reference_type, reference_number, notes
    ) VALUES (
        CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END, NOW(), 'sale',
        v_qty_delta, -- Store exact delta (can be positive for returns!)
        v_old_stock, v_new_stock, 
        CASE WHEN TG_OP = 'DELETE' THEN OLD.selling_price ELSE NEW.selling_price END,
        v_weighted_avg, 'sales', (CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END)::text,
        'System Sync (' || TG_OP || ')'
    );
    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
