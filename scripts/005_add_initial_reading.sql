-- Add initial_reading to Nozzles
-- This column is required by the frontend when creating a new nozzle.

ALTER TABLE public.nozzles ADD COLUMN IF NOT EXISTS initial_reading DECIMAL(15, 3) DEFAULT 0;
