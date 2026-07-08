-- Mystery bags can now contain sealed booster PACKS, not just singles. Add an item type and relax the
-- card-only "card_number" requirement (packs have no card number). Existing rows default to 'card'.

ALTER TABLE mystery_bag_cards ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'card';
ALTER TABLE mystery_bag_cards ALTER COLUMN card_number DROP NOT NULL;
