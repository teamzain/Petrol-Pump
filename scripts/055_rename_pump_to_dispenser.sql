-- Rename pump_number to dispenser_number in nozzles table
ALTER TABLE public.nozzles RENAME COLUMN pump_number TO dispenser_number;
