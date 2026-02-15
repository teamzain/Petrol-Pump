-- 063_final_deletion.sql
-- Goal: Pinpoint and remove the "Purchase: INV-N/A" duplicates.

-- The user logs show the bad records have description "Purchase: INV-N/A".
-- Valid records have descriptions like "Purchase Order: ..." or "Inv# ...".
-- Valid records have reference_type = 'purchase_order'.
-- Bad records have reference_type = 'purchase' or 'purchases'.

DO $$
DECLARE
    deleted_count INT;
BEGIN
    -- Delete the specific "INV-N/A" duplicates
    -- These are definitely bad if they are recent.
    WITH deleted_rows AS (
        DELETE FROM public.transactions 
        WHERE description LIKE '%INV-N/A%'
        AND (reference_type = 'purchase' OR reference_type = 'expense') -- Cover bases
        AND transaction_date >= (NOW() - INTERVAL '48 hours')
        RETURNING *
    )
    SELECT count(*) INTO deleted_count FROM deleted_rows;
    
    RAISE NOTICE 'Deleted % transactions matching INV-N/A pattern.', deleted_count;

    -- Also delete any transaction that looks like a legacy purchase item log
    -- created in the last 24 hours.
    -- New system uses 'purchase_order'. Old used 'purchase'.
    WITH deleted_rows_2 AS (
        DELETE FROM public.transactions
        WHERE reference_type = 'purchase'
        AND transaction_date >= (NOW() - INTERVAL '24 hours')
        RETURNING *
    )
    SELECT count(*) INTO deleted_count FROM deleted_rows_2;
    
    RAISE NOTICE 'Deleted % legacy purchase item transactions.', deleted_count;
END $$;
