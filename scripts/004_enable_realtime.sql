-- Enable Realtime for daily_balances
-- This ensures 'daily_balances' updates are broadcast to the client.

-- 1. Create publication if it doesn't exist (standard Supabase setup has 'supabase_realtime')
-- BUT we can just add the table to it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'daily_balances') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE daily_balances;
  END IF;
END $$;
