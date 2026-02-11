-- Module 14 Fix: Update Sales Schema to match Application Logic

-- 1. Add missing columns that frontend tries to insert
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS sale_type TEXT DEFAULT 'product',
ADD COLUMN IF NOT EXISTS nozzle_id UUID REFERENCES public.nozzles(id);

-- 2. Ensure constraints don't block if frontend sends partial data (though we should fix frontend)
-- `cogs_per_unit` and `gross_profit` are NOT NULL. We need to make sure we populate them.
-- If frontend sends `cost_price` but not `cogs_per_unit`, it fails.
-- We can add a trigger to populate defaults or handle it, but better to fix frontend.

-- 3. Add index for performance on new columns
CREATE INDEX IF NOT EXISTS idx_sales_sale_type ON public.sales(sale_type);
CREATE INDEX IF NOT EXISTS idx_sales_nozzle_id ON public.sales(nozzle_id);
