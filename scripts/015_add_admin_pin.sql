-- Add admin_pin to pump_config for local authorization
ALTER TABLE pump_config 
ADD COLUMN IF NOT EXISTS admin_pin TEXT DEFAULT '1234';

-- Comment
COMMENT ON COLUMN pump_config.admin_pin IS 'PIN for authorizing sensitive actions like editing closed sales';
