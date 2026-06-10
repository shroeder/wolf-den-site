DROP INDEX IF EXISTS idx_mystery_bag_cards_pack_token_unique;

ALTER TABLE mystery_bag_cards
    DROP COLUMN IF EXISTS pack_token;
