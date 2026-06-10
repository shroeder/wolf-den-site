ALTER TABLE mystery_bag_cards
    ADD COLUMN IF NOT EXISTS variation_sku TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mystery_bag_cards_variation_sku
    ON mystery_bag_cards(variation_sku)
    WHERE variation_sku IS NOT NULL;
