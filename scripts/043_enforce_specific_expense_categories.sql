-- Enforce Specific Expense Categories
-- 1. Ensure requested categories exist and are ACTIVE
-- 2. Mark ALL OTHER categories as INACTIVE (effectively deleting them from UI)

DO $$ 
DECLARE
    v_allowed_categories TEXT[] := ARRAY['Staff Expense', 'Utility Expense', 'Maintenance', 'Food', 'Pump Owner'];
BEGIN
    -- 1. Insert/Update Allowed Categories
    INSERT INTO public.expense_categories (category_name, category_type, is_default, status)
    VALUES
      ('Staff Expense', 'operating', TRUE, 'active'),
      ('Utility Expense', 'operating', TRUE, 'active'),
      ('Maintenance', 'operating', TRUE, 'active'),
      ('Food', 'operating', TRUE, 'active'),
      ('Pump Owner', 'operating', TRUE, 'active')
    ON CONFLICT (id) DO UPDATE -- ID might not match, conflict usually on name if unique constraint exists
    -- constraint is likely on PK. Let's rely on standard Update if insert fails or just Update generically.
    -- Actually, if there is no unique constraint on name, we might get duplicates.
    -- Let's try to update by name first.
    SET status = 'active'; 

    -- Better approach:
    -- A. Update existing allowed ones to ACTIVE
    UPDATE public.expense_categories 
    SET status = 'active' 
    WHERE category_name = ANY(v_allowed_categories);

    -- B. Insert missing allowed ones (if any)
    INSERT INTO public.expense_categories (category_name, category_type, is_default, status)
    SELECT m.name, 'operating', TRUE, 'active'
    FROM unnest(v_allowed_categories) AS m(name)
    WHERE NOT EXISTS (SELECT 1 FROM public.expense_categories WHERE category_name = m.name);

    -- 2. Deactivate OTHERS
    UPDATE public.expense_categories
    SET status = 'inactive'
    WHERE category_name != ALL(v_allowed_categories);

END $$;
