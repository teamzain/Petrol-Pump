-- Petrol Pump Management System Database Schema
-- Module 1: User Management & Authentication

-- Users table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  mobile TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'manager', 'staff')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'locked')),
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view all users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can manage users" ON public.users FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- Pump Configuration table
CREATE TABLE IF NOT EXISTS public.pump_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pump_name TEXT NOT NULL,
  address TEXT NOT NULL,
  contact_number TEXT NOT NULL,
  ntn_strn TEXT,
  license_number TEXT,
  setup_completed BOOLEAN DEFAULT FALSE,
  setup_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.pump_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view pump config" ON public.pump_config FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage pump config" ON public.pump_config FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- Opening Balance table
CREATE TABLE IF NOT EXISTS public.opening_balance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_cash DECIMAL(15, 2) NOT NULL DEFAULT 0,
  opening_bank DECIMAL(15, 2) NOT NULL DEFAULT 0,
  balance_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.opening_balance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view opening balance" ON public.opening_balance FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage opening balance" ON public.opening_balance FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- Module 3: Supplier Management
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_name TEXT NOT NULL,
  contact_person TEXT,
  phone_number TEXT NOT NULL,
  address TEXT,
  supplier_type TEXT NOT NULL CHECK (supplier_type IN ('petrol_only', 'diesel_only', 'both_petrol_diesel', 'products_oils')),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  total_purchases DECIMAL(15, 2) DEFAULT 0,
  last_purchase_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view suppliers" ON public.suppliers FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage suppliers" ON public.suppliers FOR ALL USING (auth.uid() IS NOT NULL);

-- Module 4 & 5: Product Management (Fuel & Oils)
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name TEXT NOT NULL,
  product_type TEXT NOT NULL CHECK (product_type IN ('fuel', 'oil_lubricant')),
  category TEXT, -- For oils: engine_oil, brake_oil, coolant, transmission_fluid, other
  unit TEXT NOT NULL DEFAULT 'liters',
  current_stock DECIMAL(15, 3) NOT NULL DEFAULT 0,
  minimum_stock_level DECIMAL(15, 3) DEFAULT 0,
  tank_capacity DECIMAL(15, 3), -- For fuel products only
  purchase_price DECIMAL(15, 2) NOT NULL,
  weighted_avg_cost DECIMAL(15, 4) NOT NULL,
  selling_price DECIMAL(15, 2) NOT NULL,
  last_purchase_price DECIMAL(15, 2),
  last_purchase_date DATE,
  stock_value DECIMAL(15, 2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view products" ON public.products FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage products" ON public.products FOR ALL USING (auth.uid() IS NOT NULL);

-- Price History table
CREATE TABLE IF NOT EXISTS public.price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  change_date TIMESTAMPTZ DEFAULT NOW(),
  old_purchase_price DECIMAL(15, 2),
  new_purchase_price DECIMAL(15, 2),
  old_weighted_avg DECIMAL(15, 4),
  new_weighted_avg DECIMAL(15, 4),
  old_selling_price DECIMAL(15, 2),
  new_selling_price DECIMAL(15, 2),
  change_reason TEXT,
  changed_by UUID REFERENCES auth.users(id),
  purchase_reference UUID
);

ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view price history" ON public.price_history FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert price history" ON public.price_history FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Module 6: Stock Movement / Inventory Management
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  movement_date TIMESTAMPTZ DEFAULT NOW(),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('purchase', 'sale', 'adjustment', 'initial')),
  quantity DECIMAL(15, 3) NOT NULL, -- Positive for purchase, negative for sale
  unit_price DECIMAL(15, 2),
  weighted_avg_after DECIMAL(15, 4),
  balance_after DECIMAL(15, 3) NOT NULL,
  reference_type TEXT,
  reference_number TEXT,
  supplier_id UUID REFERENCES public.suppliers(id),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view stock movements" ON public.stock_movements FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage stock movements" ON public.stock_movements FOR ALL USING (auth.uid() IS NOT NULL);

-- Module 7: Purchase Management
CREATE TABLE IF NOT EXISTS public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_date DATE NOT NULL,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity DECIMAL(15, 3) NOT NULL,
  purchase_price_per_unit DECIMAL(15, 2) NOT NULL,
  total_amount DECIMAL(15, 2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('bank_transfer', 'cheque', 'cash')),
  invoice_number TEXT UNIQUE NOT NULL,
  notes TEXT,
  old_weighted_avg DECIMAL(15, 4),
  new_weighted_avg DECIMAL(15, 4),
  recorded_by UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view purchases" ON public.purchases FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage purchases" ON public.purchases FOR ALL USING (auth.uid() IS NOT NULL);

-- Financial Accounts table (Cash and Bank balances)
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type TEXT NOT NULL CHECK (account_type IN ('cash', 'bank')),
  account_name TEXT NOT NULL,
  current_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
  last_transaction_date TIMESTAMPTZ,
  last_transaction_description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view accounts" ON public.accounts FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage accounts" ON public.accounts FOR ALL USING (auth.uid() IS NOT NULL);

-- Financial Transactions table
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_date TIMESTAMPTZ DEFAULT NOW(),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income', 'expense', 'transfer')),
  category TEXT NOT NULL, -- 'cogs', 'operating_expense', 'sale', 'purchase', etc.
  description TEXT NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  payment_method TEXT CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque')),
  from_account UUID REFERENCES public.accounts(id),
  to_account UUID REFERENCES public.accounts(id),
  reference_type TEXT,
  reference_id UUID,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view transactions" ON public.transactions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage transactions" ON public.transactions FOR ALL USING (auth.uid() IS NOT NULL);

-- Expense Categories table
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name TEXT NOT NULL,
  category_type TEXT NOT NULL CHECK (category_type IN ('cogs', 'operating')),
  is_default BOOLEAN DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view expense categories" ON public.expense_categories FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage expense categories" ON public.expense_categories FOR ALL USING (auth.uid() IS NOT NULL);

-- Insert default expense categories
INSERT INTO public.expense_categories (category_name, category_type, is_default) VALUES
  ('Fuel Purchase', 'cogs', TRUE),
  ('Oil/Lubricant Purchase', 'cogs', TRUE),
  ('Staff Salary', 'operating', TRUE),
  ('Electricity', 'operating', TRUE),
  ('Rent', 'operating', TRUE),
  ('Equipment Maintenance', 'operating', TRUE),
  ('Miscellaneous', 'operating', TRUE);

-- Daily Operations table
CREATE TABLE IF NOT EXISTS public.daily_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_date DATE NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opening_cash DECIMAL(15, 2) NOT NULL DEFAULT 0,
  closing_cash DECIMAL(15, 2),
  total_sales DECIMAL(15, 2) DEFAULT 0,
  total_expenses DECIMAL(15, 2) DEFAULT 0,
  cash_difference DECIMAL(15, 2),
  opened_by UUID REFERENCES auth.users(id),
  closed_by UUID REFERENCES auth.users(id),
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.daily_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view daily operations" ON public.daily_operations FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage daily operations" ON public.daily_operations FOR ALL USING (auth.uid() IS NOT NULL);

-- Nozzles table (for sales recording)
CREATE TABLE IF NOT EXISTS public.nozzles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nozzle_number TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  current_reading DECIMAL(15, 3) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.nozzles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view nozzles" ON public.nozzles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage nozzles" ON public.nozzles FOR ALL USING (auth.uid() IS NOT NULL);

-- Nozzle Readings table (daily readings)
CREATE TABLE IF NOT EXISTS public.nozzle_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nozzle_id UUID NOT NULL REFERENCES public.nozzles(id),
  reading_date DATE NOT NULL,
  opening_reading DECIMAL(15, 3) NOT NULL,
  closing_reading DECIMAL(15, 3) NOT NULL,
  quantity_sold DECIMAL(15, 3) NOT NULL,
  selling_price DECIMAL(15, 2) NOT NULL,
  sale_amount DECIMAL(15, 2) NOT NULL,
  cogs_per_unit DECIMAL(15, 4) NOT NULL, -- Weighted avg at time of sale
  total_cogs DECIMAL(15, 2) NOT NULL,
  gross_profit DECIMAL(15, 2) NOT NULL,
  recorded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.nozzle_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view nozzle readings" ON public.nozzle_readings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage nozzle readings" ON public.nozzle_readings FOR ALL USING (auth.uid() IS NOT NULL);

-- Sales table (for non-fuel products)
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_date DATE NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity DECIMAL(15, 3) NOT NULL,
  selling_price DECIMAL(15, 2) NOT NULL,
  sale_amount DECIMAL(15, 2) NOT NULL,
  cogs_per_unit DECIMAL(15, 4) NOT NULL,
  total_cogs DECIMAL(15, 2) NOT NULL,
  gross_profit DECIMAL(15, 2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'credit')),
  recorded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view sales" ON public.sales FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage sales" ON public.sales FOR ALL USING (auth.uid() IS NOT NULL);

-- Create trigger function to auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, full_name, username, email, mobile, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'username', NEW.email),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'mobile', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'staff')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_products_type ON public.products(product_type);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON public.stock_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON public.purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON public.purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_nozzle_readings_date ON public.nozzle_readings(reading_date);
CREATE INDEX IF NOT EXISTS idx_daily_operations_date ON public.daily_operations(operation_date);
