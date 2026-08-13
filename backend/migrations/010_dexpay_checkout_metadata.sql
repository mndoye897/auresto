-- Données serveur d’une commande en attente de paiement DexPay.
-- Elles permettent de créer la commande seulement après un webhook signé.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_payments_transaction_id
  ON payments(transaction_id);
