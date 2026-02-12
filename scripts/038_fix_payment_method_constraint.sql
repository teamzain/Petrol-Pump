-- Module 15: Fix Payment Method Constraints
-- The frontend sends 'bank' for both Sales and Nozzle Readings.
-- The database schema originally expected 'bank_transfer' for Sales.
-- This script fixes the constraints to allow 'bank' and other variations.

DO $$ 
DECLARE
    r RECORD;
BEGIN
    -- 1. Fix SALES Table Constraint
    -- Find and drop any check constraint on 'payment_method' column in 'sales' table
    FOR r IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.sales'::regclass 
        AND contype = 'c' 
        AND pg_get_constraintdef(oid) LIKE '%payment_method%'
    LOOP
        EXECUTE 'ALTER TABLE public.sales DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;

    -- Add the correct constraint
    ALTER TABLE public.sales ADD CONSTRAINT sales_payment_method_check 
    CHECK (payment_method IN ('cash', 'bank', 'bank_transfer', 'credit', 'cheque', 'card'));
    
    -- 2. Fix NOZZLE_READINGS Table Constraint
    -- Find and drop any check constraint on 'payment_method' column in 'nozzle_readings' table
    FOR r IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.nozzle_readings'::regclass 
        AND contype = 'c' 
        AND pg_get_constraintdef(oid) LIKE '%payment_method%'
    LOOP
        EXECUTE 'ALTER TABLE public.nozzle_readings DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;

    -- Add the correct constraint
    ALTER TABLE public.nozzle_readings ADD CONSTRAINT nozzle_readings_payment_method_check 
    CHECK (payment_method IN ('cash', 'bank', 'bank_transfer', 'credit', 'cheque', 'card'));

END $$;
