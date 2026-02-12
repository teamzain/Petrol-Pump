-- Force Timezone to Pakistan Standard Time (PKT)
-- This ensures NOW() and CURRENT_DATE return Pakistan time, not UTC.

-- Option 1: Set for the specific database (requires superuser usually, but often works in Supabase)
ALTER DATABASE postgres SET timezone TO 'Asia/Karachi';

-- Option 2: Set for the authenticated role (postgres/authenticated)
ALTER ROLE authenticated SET timezone TO 'Asia/Karachi';
ALTER ROLE service_role SET timezone TO 'Asia/Karachi';
ALTER ROLE postgres SET timezone TO 'Asia/Karachi';

-- Verify the time
SELECT NOW()::timestamptz AS current_db_time, current_setting('TIMEZONE') as timezone;
