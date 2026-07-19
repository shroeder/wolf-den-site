-- The hand-picked IN-GAME item awarded to the #1 damage dealer on a boss kill (the "chase" gear that
-- pairs with the real Square raffle prize). Null = no in-game chase item set.
ALTER TABLE boss_event ADD COLUMN IF NOT EXISTS chase_item_id TEXT;
