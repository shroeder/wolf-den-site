-- Link a marketplace account to its Square customer, so an in-store POS sale (attached to that Square
-- customer) can later credit loyalty XP to the same online account. Set from online orders for now.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS square_customer_id TEXT;
CREATE INDEX IF NOT EXISTS idx_mkt_buyer_square_customer ON mkt_buyer (square_customer_id) WHERE square_customer_id IS NOT NULL;
