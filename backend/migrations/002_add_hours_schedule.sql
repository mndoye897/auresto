-- Add hours_schedule to restaurants table
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS hours_schedule JSONB DEFAULT '{}'::jsonb;
