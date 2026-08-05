-- Migration 005: Add restaurant_code and audit_logs table for Auresto Owner Console

-- 1. Add restaurant_code column to restaurants table
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS restaurant_code TEXT UNIQUE;

-- 2. Backfill existing restaurants with code format AR-XXXXXX
UPDATE restaurants 
SET restaurant_code = 'AR-' || LPAD(id::text, 6, '0')
WHERE restaurant_code IS NULL;

-- 3. Create audit_logs table to track owner actions
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  restaurant_id INT REFERENCES restaurants(id) ON DELETE CASCADE,
  restaurant_code TEXT,
  actor_type TEXT DEFAULT 'OWNER',
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
