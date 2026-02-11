-- Module 11: Daily Operations & Cash Reconciliation Schema

-- 1. Enhance daily_operations table
ALTER TABLE public.daily_operations 
ADD COLUMN IF NOT EXISTS opening_cash_actual DECIMAL(15, 2),
ADD COLUMN IF NOT EXISTS opening_cash_variance DECIMAL(15, 2),
ADD COLUMN IF NOT EXISTS opening_cash_variance_note TEXT,
ADD COLUMN IF NOT EXISTS opening_bank DECIMAL(15, 2),
ADD COLUMN IF NOT EXISTS closing_cash_actual DECIMAL(15, 2),
ADD COLUMN IF NOT EXISTS closing_cash_variance DECIMAL(15, 2),
ADD COLUMN IF NOT EXISTS closing_cash_variance_note TEXT,
ADD COLUMN IF NOT EXISTS closing_bank DECIMAL(15, 2),
ADD COLUMN IF NOT EXISTS day_locked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reconciliation_completed BOOLEAN DEFAULT FALSE;

-- 2. Create Audit Log Table
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_time TIMESTAMPTZ DEFAULT NOW(),
  event_type TEXT NOT NULL, -- 'DAY_OPEN', 'DAY_CLOSE', 'OVERRIDE', 'VARIANCE_ALERT'
  action TEXT NOT NULL,
  performed_by UUID REFERENCES public.users(id),
  related_record_type TEXT, -- 'daily_operations', 'cash_reconciliation'
  related_record_id UUID,
  details JSONB, -- Store snapshot of data or specific details
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Cash Variance Log Table (Individual Incidents)
CREATE TABLE IF NOT EXISTS public.cash_variance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variance_date DATE NOT NULL,
  variance_type TEXT NOT NULL CHECK (variance_type IN ('OPENING_CASH', 'CLOSING_CASH')),
  expected_amount DECIMAL(15, 2) NOT NULL,
  actual_amount DECIMAL(15, 2) NOT NULL,
  difference DECIMAL(15, 2) NOT NULL,
  variance_percentage DECIMAL(5, 4), -- e.g. 0.0050 for 0.5%
  explanation TEXT,
  reported_by UUID REFERENCES public.users(id),
  is_resolved BOOLEAN DEFAULT FALSE,
  pattern_flag_id UUID, -- Link to pattern analysis if recurring
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create Pattern Analysis Table (Aggregated Stats)
CREATE TABLE IF NOT EXISTS public.pattern_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  pattern_type TEXT NOT NULL, -- 'CASH_SHORTAGE_RECURRING', etc.
  occurrence_count INTEGER DEFAULT 0,
  total_variance_amount DECIMAL(15, 2) DEFAULT 0,
  average_variance DECIMAL(15, 2) DEFAULT 0,
  status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'RESOLVED'
  severity TEXT DEFAULT 'MEDIUM', -- 'LOW', 'MEDIUM', 'HIGH'
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create Cash Reconciliation Table (Detailed Close Record)
CREATE TABLE IF NOT EXISTS public.cash_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_date DATE NOT NULL,
  daily_operation_id UUID REFERENCES public.daily_operations(id),
  
  -- Snapshots
  opening_cash DECIMAL(15, 2) NOT NULL,
  total_cash_sales DECIMAL(15, 2) NOT NULL,
  total_cash_expenses DECIMAL(15, 2) NOT NULL,
  other_cash_in DECIMAL(15, 2) DEFAULT 0,
  other_cash_out DECIMAL(15, 2) DEFAULT 0,
  
  expected_closing_cash DECIMAL(15, 2) NOT NULL,
  actual_closing_cash DECIMAL(15, 2) NOT NULL,
  variance DECIMAL(15, 2) NOT NULL,
  
  status TEXT DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'FLAGGED'
  reconciled_by UUID REFERENCES public.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Enable RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_variance_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pattern_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_reconciliation ENABLE ROW LEVEL SECURITY;

-- 7. Policies
-- Audit Log: Viewable by Admin/Manager only
CREATE POLICY "Admins/Managers view audit logs" ON public.audit_log 
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );
CREATE POLICY "System can insert audit logs" ON public.audit_log 
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Cash Variance: Viewable by all (for transparency) or restrict? Let's say Admin/Manager + Staff (own?)
-- For now, allow authenticated to view 
CREATE POLICY "Auth users view variances" ON public.cash_variance_log FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth users insert variances" ON public.cash_variance_log FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Pattern Analysis: Viewable by Admin/Manager
CREATE POLICY "Admins/Managers view patterns" ON public.pattern_analysis 
  FOR SELECT USING (
     EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- Cash Reconciliation: View by Auth, Manage by Auth
CREATE POLICY "Auth users view reconciliation" ON public.cash_reconciliation FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth users insert reconciliation" ON public.cash_reconciliation FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
