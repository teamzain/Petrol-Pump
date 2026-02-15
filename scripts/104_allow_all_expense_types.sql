-- 104_allow_all_expense_types.sql
-- Fixes validation error when selecting 'Fixed Cost', 'Maintenance', or 'Other' in Expenses.
-- The original schema restricted category_type to only ('cogs', 'operating').

BEGIN;

-- 1. Drop the old restrictive constraint
ALTER TABLE public.expense_categories 
DROP CONSTRAINT IF EXISTS expense_categories_category_type_check;

-- 2. Add the new inclusive constraint
ALTER TABLE public.expense_categories 
ADD CONSTRAINT expense_categories_category_type_check 
CHECK (category_type IN ('cogs', 'operating', 'fixed', 'maintenance', 'other'));

COMMIT;
