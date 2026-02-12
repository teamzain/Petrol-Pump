-- Add Additional Expense Categories requested by User
-- Schema strictly allows 'cogs' or 'operating'. We will map these to 'operating'.

INSERT INTO public.expense_categories (category_name, category_type, is_default, status)
VALUES
  ('Staff Expense', 'operating', TRUE, 'active'),
  ('Utility Expense', 'operating', TRUE, 'active'),
  ('Maintenance', 'operating', TRUE, 'active'),
  ('Food', 'operating', TRUE, 'active'),
  ('Pump Owner', 'operating', TRUE, 'active')
ON CONFLICT DO NOTHING;

-- Ensure they are active (in case they existed but were inactive)
UPDATE public.expense_categories 
SET status = 'active' 
WHERE category_name IN ('Staff Expense', 'Utility Expense', 'Maintenance', 'Food', 'Pump Owner');
