-- Fix Schema Script

-- 1. Update Suppliers Check Constraint
ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_supplier_type_check;
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_supplier_type_check 
  CHECK (supplier_type IN ('petrol_only', 'diesel_only', 'both_petrol_diesel', 'products_oils', 'both_petrol_diesel_and_oils'));

-- 2. Add Missing Columns to Nozzles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nozzles' AND column_name = 'pump_number') THEN
        ALTER TABLE public.nozzles ADD COLUMN pump_number INTEGER DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nozzles' AND column_name = 'nozzle_side') THEN
        ALTER TABLE public.nozzles ADD COLUMN nozzle_side TEXT DEFAULT 'A';
    END IF;
END $$;

-- 3. Create daily_balances table (missing in original schema but used in Dashboard)
CREATE TABLE IF NOT EXISTS public.daily_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  balance_date DATE NOT NULL UNIQUE,
  is_closed BOOLEAN DEFAULT FALSE,
  cash_opening DECIMAL(15, 2) DEFAULT 0,
  cash_closing DECIMAL(15, 2) DEFAULT 0,
  bank_opening DECIMAL(15, 2) DEFAULT 0,
  bank_closing DECIMAL(15, 2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for daily_balances
ALTER TABLE public.daily_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view daily_balances" ON public.daily_balances FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage daily_balances" ON public.daily_balances FOR ALL USING (auth.uid() IS NOT NULL);
