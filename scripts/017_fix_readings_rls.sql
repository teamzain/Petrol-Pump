-- Enable RLS on nozzle_readings
ALTER TABLE public.nozzle_readings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Authenticated users can view nozzle_readings" ON public.nozzle_readings;
DROP POLICY IF EXISTS "Authenticated users can manage nozzle_readings" ON public.nozzle_readings;
DROP POLICY IF EXISTS "Allow all authenticated nozzle_readings" ON public.nozzle_readings;

-- Create comprehensive policy
CREATE POLICY "Allow all authenticated nozzle_readings"
ON public.nozzle_readings
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Also fix sales table just in case
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated users can manage sales" ON public.sales;
DROP POLICY IF EXISTS "Allow all authenticated sales" ON public.sales;

CREATE POLICY "Allow all authenticated sales"
ON public.sales
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
