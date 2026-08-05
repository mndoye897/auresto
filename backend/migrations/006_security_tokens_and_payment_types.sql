-- Migration 006: Restaurant access tokens + payment type separation
-- Idempotent — safe to re-run

-- 1. Per-restaurant API access token (never exposed in frontend as a global secret)
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS access_token TEXT UNIQUE;

-- 2. Distinguish subscription payments (Restaurant → Auresto) from order payments (Client → Restaurant)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'SUBSCRIPTION';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS order_id INT REFERENCES orders(id) ON DELETE SET NULL;

-- 3. Indexes for lookups
CREATE INDEX IF NOT EXISTS idx_payments_payment_type ON payments(payment_type);
CREATE INDEX IF NOT EXISTS idx_payments_restaurant_type ON payments(restaurant_id, payment_type);
CREATE INDEX IF NOT EXISTS idx_restaurants_access_token ON restaurants(access_token);

-- Note: access_token backfill for existing rows is handled by server initDB()
-- using Node crypto if pgcrypto is unavailable.
