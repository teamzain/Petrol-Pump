-- Check if any nozzle readings exist for today
SELECT * FROM nozzle_readings WHERE reading_date = '2026-02-11';

-- Check if any sales exist for today
SELECT * FROM sales WHERE sale_date = '2026-02-11';
