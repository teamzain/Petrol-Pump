-- 109_add_transaction_status.sql
-- Adds status column to transactions to support pending/hold states.

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed' 
CHECK (status IN ('hold', 'scheduled', 'received', 'completed', 'cancelled'));

-- Update existing records to 'completed'
UPDATE public.transactions SET status = 'completed' WHERE status IS NULL;

-- [NEW] Update purchase_orders status constraint to allow 'hold' and 'scheduled'
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_status_check 
CHECK (status IN ('pending', 'completed', 'cancelled', 'hold', 'scheduled', 'received'));
