-- DANGEROUS: This script deletes ALL data from the application tables.
-- It preserves the schema (tables, columns, policies) but wipes the rows.
-- It uses CASCADE to handle foreign key constraints automatically.

-- We include all known tables to ensure a complete wipe.
TRUNCATE TABLE
  public.daily_balances,
  public.transactions,
  public.sales,
  public.purchases,
  public.daily_operations,
  public.nozzle_readings,
  public.stock_movements,
  public.price_history,
  public.opening_balance,
  public.accounts,
  public.nozzles,
  public.products,
  public.suppliers,
  public.expense_categories,
  public.pump_config,
  public.users
RESTART IDENTITY CASCADE;

-- Note: We include public.users here. If you want to keep the user profiles
-- but delete everything else, remove 'public.users' from the list.
-- However, Auth users (in auth.users) are NOT deleted by this script.
