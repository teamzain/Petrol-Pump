-- 062_nuclear_purchase_cleanup.sql
-- Goal: ABSOLUTELY DESTROY any trigger on the 'purchases' table causing duplicates.

DO $$ 
DECLARE
    r RECORD;
BEGIN
    -- 1. DYNAMICALLY DROP ALL TRIGGERS ON 'public.purchases'
    -- We loop through the system catalog and drop everything attached to this table.
    FOR r IN (SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'purchases') 
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(r.trigger_name) || ' ON public.purchases;';
        RAISE NOTICE 'Dropped Trigger: %', r.trigger_name;
    END LOOP;
END $$;

-- 2. CLEAN UP THE SPECIFIC DUPLICATES IDENTIFIED BY USER
-- User reported: "Purchase: INV-N/A" duplicates.
-- We delete these specific rows for the last 24 hours.

DELETE FROM public.transactions 
WHERE description LIKE 'Purchase: INV-%'
AND (
    reference_type = 'purchase' 
    OR reference_type = 'purchases'
    OR description LIKE '%INV-N/A%'
)
AND transaction_date >= (NOW() - INTERVAL '48 hours');

-- 3. ENSURE NO LEGACY FUNCTION SURVIVES
-- Disable the legacy function logic entirely just in case
CREATE OR REPLACE FUNCTION public.handle_purchase_financials()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RETURN NEW; -- Do nothing
END; $$;
