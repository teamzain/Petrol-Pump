-- Final Reset of Expense Categories
-- 1. Merge Duplicates (Fixes "Showing Twice")
-- 2. Ensure only specific categories exist/active.
-- 3. Delete/Archive others.

DO $$ 
DECLARE
    r RECORD;
    master_id UUID;
    v_allowed TEXT[] := ARRAY['Staff Expense', 'Utility Expense', 'Maintenance', 'Food', 'Pump Owner'];
BEGIN
    -- =============================================================================================
    -- STEP 1: MERGE DUPLICATES (Fixes the "Showing Twice" issue)
    -- =============================================================================================
    FOR r IN 
        SELECT category_name, COUNT(*) 
        FROM public.expense_categories 
        GROUP BY category_name 
        HAVING COUNT(*) > 1
    LOOP
        -- Pick the first created as master
        SELECT id INTO master_id FROM public.expense_categories WHERE category_name = r.category_name ORDER BY created_at ASC LIMIT 1;

        -- Reassign expenses
        UPDATE public.expenses 
        SET category_id = master_id 
        WHERE category_id IN (SELECT id FROM public.expense_categories WHERE category_name = r.category_name AND id != master_id);

        -- Delete duplicates
        DELETE FROM public.expense_categories WHERE category_name = r.category_name AND id != master_id;
        
        RAISE NOTICE 'Merged duplicates for: %', r.category_name;
    END LOOP;

    -- =============================================================================================
    -- STEP 2: ENSURE ALLOWED LIST EXISTS
    -- =============================================================================================
    INSERT INTO public.expense_categories (category_name, category_type, is_default, status)
    SELECT m.name, 'operating', TRUE, 'active'
    FROM unnest(v_allowed) AS m(name)
    WHERE NOT EXISTS (SELECT 1 FROM public.expense_categories WHERE category_name = m.name);

    -- Ensure they are ACTIVE
    UPDATE public.expense_categories 
    SET status = 'active' 
    WHERE category_name = ANY(v_allowed);

    -- =============================================================================================
    -- STEP 3: DELETE OR ARCHIVE 'OTHER' CATEGORIES
    -- =============================================================================================
    -- Try to delete first (if no expenses linked)
    DELETE FROM public.expense_categories 
    WHERE category_name != ALL(v_allowed)
    AND id NOT IN (SELECT DISTINCT category_id FROM public.expenses);

    -- If any remain (because they have linked expenses), mark them INACTIVE so they don't show in UI
    UPDATE public.expense_categories 
    SET status = 'inactive'
    WHERE category_name != ALL(v_allowed);

    -- =============================================================================================
    -- STEP 4: ADD UNIQUE CONSTRAINT (Prevention)
    -- =============================================================================================
    BEGIN
        ALTER TABLE public.expense_categories ADD CONSTRAINT expense_categories_name_key UNIQUE (category_name);
    EXCEPTION WHEN unique_violation THEN
        NULL; -- Already exists
    WHEN duplicate_table THEN
        NULL; 
    END;

END $$;
