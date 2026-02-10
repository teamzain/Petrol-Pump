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

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);

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
CREATE POLICY "Authenticated users can insert pump config" ON public.pump_config FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update pump config" ON public.pump_config FOR UPDATE USING (auth.uid() IS NOT NULL);

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
CREATE POLICY "Authenticated users can insert opening balance" ON public.opening_balance FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Suppliers table
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
CREATE POLICY "Authenticated users can insert suppliers" ON public.suppliers FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update suppliers" ON public.suppliers FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete suppliers" ON public.suppliers FOR DELETE USING (auth.uid() IS NOT NULL);

-- Products table
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name TEXT NOT NULL,
  product_type TEXT NOT NULL CHECK (product_type IN ('fuel', 'oil_lubricant')),
  category TEXT,
  unit TEXT NOT NULL DEFAULT 'liters',
  current_stock DECIMAL(15, 3) NOT NULL DEFAULT 0,
  minimum_stock_level DECIMAL(15, 3) DEFAULT 0,
  tank_capacity DECIMAL(15, 3),
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
CREATE POLICY "Authenticated users can insert products" ON public.products FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update products" ON public.products FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete products" ON public.products FOR DELETE USING (auth.uid() IS NOT NULL);
