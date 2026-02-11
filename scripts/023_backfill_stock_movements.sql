-- Module 11 Fix: Backfill Stock Movements (Robust Version)

INSERT INTO public.stock_movements (
  product_id,
  movement_date,
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
)
SELECT 
  s.product_id,
  s.created_at,
  'sale',
  -s.quantity,
  s.selling_price,
  COALESCE(p.weighted_avg_cost, 0),
  -- Best effort balance: Current Stock. 
  -- Cannot accurately reconstruct historical balance without full replay.
  COALESCE(p.current_stock, 0), 
  'sales',
  s.id::text,
  s.recorded_by,
  s.created_at,
  'System Backfill: Historical Sale'
FROM public.sales s
JOIN public.products p ON p.id = s.product_id
LEFT JOIN public.stock_movements sm 
  ON sm.reference_type = 'sales' AND sm.reference_number = s.id::text
WHERE sm.id IS NULL;
