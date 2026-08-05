-- Migration 004: Subscriptions, Payments and Owner Management for Auresto SaaS

-- 1. Add subscription and owner columns to restaurants table
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS owner_email TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS owner_phone TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'FREE';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'ACTIVE';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMP WITH TIME ZONE DEFAULT now();
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS grace_period_days INT DEFAULT 3;

-- 2. Subscriptions history table
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  restaurant_id INT REFERENCES restaurants(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'FCFA',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  payment_provider TEXT DEFAULT 'WAVE',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Payments history table
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  restaurant_id INT REFERENCES restaurants(id) ON DELETE CASCADE,
  subscription_id INT REFERENCES subscriptions(id) ON DELETE SET NULL,
  provider TEXT DEFAULT 'WAVE',
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'FCFA',
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  transaction_id TEXT UNIQUE,
  checkout_session_id TEXT,
  paid_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. Owner accounts table for Owner Dashboard authentication
CREATE TABLE IF NOT EXISTS owner_users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
