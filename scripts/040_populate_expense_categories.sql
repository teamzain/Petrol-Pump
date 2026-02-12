-- Populate Default Expense Categories if they don't exist
INSERT INTO public.expense_categories (category_name, category_type, is_default, status)
VALUES
  ('Fuel Purchase', 'cogs', TRUE, 'active'),
  ('Oil/Lubricant Purchase', 'cogs', TRUE, 'active'),
  ('Staff Salary', 'operating', TRUE, 'active'),
  ('Electricity', 'operating', TRUE, 'active'),
  ('Rent', 'operating', TRUE, 'active'),
  ('Equipment Maintenance', 'operating', TRUE, 'active'),
  ('Miscellaneous', 'operating', TRUE, 'active'),
  ('Food & Entertainment', 'operating', TRUE, 'active'),
  ('Repairing', 'operating', TRUE, 'active')
ON CONFLICT DO NOTHING;

-- Ensure all existing categories are active if they were accidentally deactivated
UPDATE public.expense_categories SET status = 'active' WHERE status IS NULL;
