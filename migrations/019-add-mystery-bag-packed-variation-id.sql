-- Track the "packed" Square variation (SKU MP-...) separately from the
-- source single's variation.
--
-- square_variation_id  = the original single card's variation (used to restock singles)
-- packed_variation_id  = the throwaway variation created per mystery bag card; this is
--                        the one printed on the label, scanned at POS, reported by the
--                        order.updated webhook, and deleted on sale/removal.
-- variation_sku        = the packed variation's SKU (MP-...), also the canonical card_id.
--
-- Existing rows pre-date this column and only carry the source id in
-- square_variation_id; the webhook's variation_sku fallback still resolves them.
ALTER TABLE mystery_bag_cards
    ADD COLUMN IF NOT EXISTS packed_variation_id TEXT;

CREATE INDEX IF NOT EXISTS idx_mystery_bag_cards_packed_variation_id
    ON mystery_bag_cards(packed_variation_id)
    WHERE packed_variation_id IS NOT NULL;
