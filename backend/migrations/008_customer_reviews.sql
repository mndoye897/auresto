-- Migration 008: avis clients
-- Idempotent — safe to re-run
--
-- Les avis sont déposés par des clients NON authentifiés (scan du QR
-- code). La table est donc conçue pour être alimentée par une route
-- publique : contraintes strictes en base, et modération possible.

CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  restaurant_id INT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  customer_name TEXT,
  table_number TEXT,
  -- 'published' par défaut ; 'hidden' permet au restaurateur de masquer
  -- un avis sans le supprimer.
  status TEXT NOT NULL DEFAULT 'published',
  -- Empreinte non nominative de l'auteur (hash), uniquement pour limiter
  -- les dépôts répétés. Aucune adresse IP n'est stockée en clair.
  author_fingerprint TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_restaurant_created
  ON reviews(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_restaurant_rating
  ON reviews(restaurant_id, rating);
CREATE INDEX IF NOT EXISTS idx_reviews_restaurant_status
  ON reviews(restaurant_id, status);

-- Limitation des dépôts répétés : au plus un avis par empreinte, par
-- restaurant et par heure.
CREATE INDEX IF NOT EXISTS idx_reviews_fingerprint_window
  ON reviews(restaurant_id, author_fingerprint, created_at DESC);
