-- ============================================================
-- 009 — Mode de service de la commande (sur place / à emporter)
--
-- Le client choisit dans le menu s'il consomme sur place ou emporte.
-- Le restaurateur a besoin de l'information en cuisine et dans le
-- tableau de bord : sans elle, il ne sait pas s'il doit dresser une
-- assiette ou préparer un emballage.
--
-- 'dinein' par défaut : c'est le cas le plus courant, et cela laisse
-- les commandes déjà enregistrées dans un état cohérent.
--
-- Note : pas de bloc DO $$ ... $$ ici, le lanceur de migrations découpe
-- le fichier sur les points-virgules et casserait le corps du bloc.
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'dinein';

CREATE INDEX IF NOT EXISTS idx_orders_order_type
  ON orders(restaurant_id, order_type);
