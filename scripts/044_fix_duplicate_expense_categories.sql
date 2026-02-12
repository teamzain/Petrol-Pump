-- Fix Duplicate Expense Categories
-- 1. Identify duplicates by name.
-- 2. Migrate any linked expenses to one 'master' ID.
-- 3. Delete the duplicate IDs.
-- 4. Add a unique constraint to prevent future duplicates.

DO $$ 
DECLARE
    r RECORD;
    master_id UUID;
BEGIN
    -- Loop through each category name that has duplicates
    FOR r IN 
        SELECT category_name, COUNT(*) 
        FROM public.expense_categories 
        GROUP BY category_name 
        HAVING COUNT(*) > 1
    LOOP
        -- Pick the 'oldest' or 'first' one as master
        SELECT id INTO master_id 
        FROM public.expense_categories 
        WHERE category_name = r.category_name 
        ORDER BY created_at ASC 
        LIMIT 1;

        -- Update expenses table to point to master_id where they point to a duplicate
        UPDATE public.expenses 
        SET category_id = master_id 
        WHERE category_id IN (
            SELECT id FROM public.expense_categories 
            WHERE category_name = r.category_name AND id != master_id
        );

        -- Delete the duplicates
        DELETE FROM public.expense_categories 
        WHERE category_name = r.category_name AND id != master_id;
        
        RAISE NOTICE 'Merged duplicates for category: %', r.category_name;
    END LOOP;

    -- Add Unique Constraint to prevent this in future
    BEGIN
        ALTER TABLE public.expense_categories ADD CONSTRAINT expense_categories_name_key UNIQUE (category_name);
    EXCEPTION WHEN unique_violation THEN
        NULL; -- Should not happen after cleanup
    WHEN duplicate_table THEN
        NULL; -- Constraint might already exist
    END;

END $$;
