-- Check if expense categories exist
SELECT count(*) as category_count FROM public.expense_categories;
SELECT * FROM public.expense_categories ORDER BY category_name;
