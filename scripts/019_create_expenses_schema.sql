-- Module 10: Expense Management Schema

-- 1. Create Expenses Table
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category_id UUID NOT NULL REFERENCES public.expense_categories(id),
  amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque')),
  description TEXT NOT NULL,
  paid_to TEXT,
  invoice_number TEXT,
  notes TEXT,
  transaction_id UUID REFERENCES public.transactions(id),
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- 3. Create Policies
CREATE POLICY "Authenticated users can view expenses" ON public.expenses FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert expenses" ON public.expenses FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update expenses" ON public.expenses FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete expenses" ON public.expenses FOR DELETE USING (auth.uid() IS NOT NULL);

-- 4. Create Indexes
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category_id);

-- 5. Helper Function for Updated At
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_expenses_updated_at
    BEFORE UPDATE ON public.expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 6. Ensure Expense Categories Exist (Idempotent)
INSERT INTO public.expense_categories (category_name, category_type, is_default)
VALUES 
  ('Salaries', 'operating', TRUE),
  ('Utilities', 'operating', TRUE),
  ('Maintenance', 'operating', TRUE),
  ('Office Supplies', 'operating', TRUE),
  ('Transportation', 'operating', TRUE),
  ('Licenses & Permits', 'operating', TRUE),
  ('Marketing', 'operating', TRUE),
  ('Professional Fees', 'operating', TRUE),
  ('Security', 'operating', TRUE),
  ('Miscellaneous', 'operating', TRUE)
ON CONFLICT DO NOTHING;
