-- Fix: Auto-generate Stock Movements for Sales

-- 1. Create Trigger Function
CREATE OR REPLACE FUNCTION public.handle_new_sale_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_stock DECIMAL(15, 3);
  v_weighted_avg DECIMAL(15, 4);
BEGIN
  -- Get current product details (stock before this sale, ideally we trigger AFTER insert so stock might be updated already by app, 
  -- BUT stock update in app happens separately. Let's fetch current state.)
  -- App updates stock: `UPDATE products SET current_stock = ...`
  -- App inserts sale: `INSERT INTO sales ...`
  -- The order in app is: INSERT SALE -> UPDATE PRODUCT STOCK.
  -- So if we trigger AFTER INSERT ON SALES, the product stock might NOT be updated yet!
  -- Let's calculate balance_after based on current DB state - Quantity.
  
  SELECT current_stock, weighted_avg_cost INTO v_current_stock, v_weighted_avg
  FROM public.products
  WHERE id = NEW.product_id;

  INSERT INTO public.stock_movements (
    product_id,
    movement_type,
    quantity,
    unit_price,
    weighted_avg_after, -- Cost didn't change on sale
    balance_after, -- This will be slightly off if we don't account for the update. 
                   -- Actually, since we subtract NEW.quantity, we are simulating the new stock.
    reference_type,
    reference_number,
    created_by,
    created_at
  ) VALUES (
    NEW.product_id,
    'sale',
    -NEW.quantity, -- Negative for stock out
    NEW.selling_price,
    v_weighted_avg,
    v_current_stock - NEW.quantity, -- Projected new balance
    'sales', -- Table name as reference type
    NEW.id::text, -- Sale ID
    NEW.recorded_by,
    NEW.created_at
  );

  RETURN NEW;
END;
$$;

-- 2. Create Trigger
DROP TRIGGER IF EXISTS on_sale_created_stock_movement ON public.sales;

CREATE TRIGGER on_sale_created_stock_movement
  AFTER INSERT ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_sale_stock_movement();
