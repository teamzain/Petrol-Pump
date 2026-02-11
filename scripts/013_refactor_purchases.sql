-- REFACTOR PURCHASES (Master-Detail)

-- 1. Create Purchase Orders (Header)
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_date DATE NOT NULL,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  invoice_number TEXT NOT NULL,
  total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  due_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  payment_method TEXT CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque', 'credit')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(invoice_number)
);

-- Enable RLS
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Authenticated users can manage orders" ON public.purchase_orders;

CREATE POLICY "Authenticated users can view orders" ON public.purchase_orders FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage orders" ON public.purchase_orders FOR ALL USING (auth.uid() IS NOT NULL);

-- 2. Modify Purchases (Items)
-- Link to Purchase Order
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.purchase_orders(id) ON DELETE CASCADE;

-- Remove Unique Constraint on invoice_number (Items can share same invoice number if we store it, or we rely on parent)
-- We will drop the constraint.
ALTER TABLE public.purchases DROP CONSTRAINT IF EXISTS purchases_invoice_number_key;

-- Make fields potentially nullable if they are effectively moved to header (optional, but good for flexibility)
ALTER TABLE public.purchases ALTER COLUMN invoice_number DROP NOT NULL;
