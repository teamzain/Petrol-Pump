-- 067_cleanup_legacy_sales_triggers.sql
-- Drop legacy triggers that might be double-counting sales financials.

-- Drop legacy triggers on Sales
DROP TRIGGER IF EXISTS trg_master_sales_financials ON public.sales;
DROP TRIGGER IF EXISTS trg_sale_financials ON public.sales;
DROP TRIGGER IF EXISTS on_sale_financials ON public.sales;

-- Drop legacy triggers on Nozzle Readings
DROP TRIGGER IF EXISTS trg_master_readings_financials ON public.nozzle_readings;
DROP TRIGGER IF EXISTS trg_reading_financials ON public.nozzle_readings;
DROP TRIGGER IF EXISTS on_reading_financials ON public.nozzle_readings;

-- Note: 'tr_nozzle_readings_financials' and 'tr_sales_financials' are the new V3 triggers.
-- They correctly call handle_sale_financials_v3().
