-- Module 13: Notifications System Schema

-- 1. Create Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Who gets notified (NULL for system/all admins)
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'error', 'success')),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  link TEXT, -- Optional link to redirect user
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add Balance to Suppliers (for "Due in Supplier" tracking)
ALTER TABLE public.suppliers
ADD COLUMN IF NOT EXISTS balance DECIMAL(15, 2) DEFAULT 0;

-- 3. Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 4. Policies
-- Users can view their own notifications OR system notifications (user_id IS NULL)
CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

-- Users can update (mark read) their own notifications
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- System/Admins can insert
CREATE POLICY "Admins manage notifications" ON public.notifications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- 5. Trigger for Low Stock Notification (Optional / Advanced)
-- Instead of a trigger, we can fetch low stock via a view or live query in the component.
-- A live query is simpler and less spammy than inserting rows for every stock change.
-- However, for audit, a row is better. Let's start with live query in UI for now as requested "shows low stock".

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at);
