-- Migration 007: réparation de la table orders + socle analytique
-- Idempotent — safe to re-run
--
-- Contexte : la table `orders` créée en 001 ne contenait que
-- (id, restaurant_id, payload, status, total, created_at), alors que
-- l'API insérait sur table_number / payment_method / items_json /
-- total_amount. L'INSERT échouait donc systématiquement et le code
-- retombait sur un objet en mémoire : aucune commande n'était persistée.

-- 1. Colonnes manquantes sur orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS items_json JSONB DEFAULT '[]'::jsonb;

-- Identifiant d'origine côté client (localStorage) : permet une
-- synchronisation idempotente, sans doublon si le client renvoie.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_order_id TEXT;

-- 2. Lignes de commande — indispensable pour agréger les ventes par plat
--    (top/flop, CA par plat, quantités) directement en SQL.
--    restaurant_id est dénormalisé pour permettre un filtrage scopé
--    performant sans jointure sur chaque requête analytique.
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INT REFERENCES orders(id) ON DELETE CASCADE,
  restaurant_id INT REFERENCES restaurants(id) ON DELETE CASCADE,
  menu_item_id INT REFERENCES menu_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT,
  qty INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Index analytiques
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_created
  ON orders(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status
  ON orders(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_order_items_restaurant
  ON order_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_restaurant_name
  ON order_items(restaurant_id, name);
CREATE INDEX IF NOT EXISTS idx_order_items_created
  ON order_items(restaurant_id, created_at DESC);

-- Anti-doublon sur la synchronisation client -> serveur
CREATE UNIQUE INDEX IF NOT EXISTS uniq_orders_restaurant_client_order
  ON orders(restaurant_id, client_order_id)
  WHERE client_order_id IS NOT NULL;

-- 4. Normalisation des statuts hérités vers le vocabulaire du frontend
--    (new | preparing | ready | served | cancelled)
UPDATE orders SET status = 'new'       WHERE lower(status) IN ('pending', 'nouvelle');
UPDATE orders SET status = 'preparing' WHERE lower(status) IN ('in_progress', 'preparation');
UPDATE orders SET status = 'served'    WHERE lower(status) IN ('done', 'completed', 'termine', 'terminee');
UPDATE orders SET status = 'cancelled' WHERE lower(status) IN ('canceled', 'annule', 'annulee');
