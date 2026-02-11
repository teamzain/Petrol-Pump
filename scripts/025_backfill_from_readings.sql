-- Module 14 Fix: Backfill SALES from Nozzle Readings
-- This populates the missing Sales records.
-- IMPORTANT: This relies on the trigger from Script 022 to creating Stock Movements.

INSERT INTO public.sales (
  sale_date,
  product_id,
  quantity,
  selling_price,
  sale_amount,
  cogs_per_unit,
  total_cogs,
  gross_profit,
  sale_type,
  nozzle_id,
  payment_method,
  created_at
)
SELECT
  nr.reading_date,
  n.product_id,
  nr.quantity_sold,
  COALESCE(p.selling_price, 0), -- Use current price as fallback
  nr.sale_amount,
  COALESCE(p.weighted_avg_cost, 0), -- Use current cost as fallback
  (nr.quantity_sold * COALESCE(p.weighted_avg_cost, 0)),
  (nr.sale_amount - (nr.quantity_sold * COALESCE(p.weighted_avg_cost, 0))),
  'fuel',
  nr.nozzle_id,
  'cash', -- Assume cash for fuel
  nr.created_at
FROM public.nozzle_readings nr
JOIN public.nozzles n ON n.id = nr.nozzle_id
JOIN public.products p ON p.id = n.product_id
LEFT JOIN public.sales s ON s.nozzle_id = nr.nozzle_id AND s.sale_date = nr.reading_date
WHERE nr.quantity_sold > 0
AND s.id IS NULL;
