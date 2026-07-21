-- Pets in player-to-player trades. A trade offer can now include pets on either side alongside items + gold.
-- On accept, each traded pet follows the "share a copy, lock both" model (same as the older gift flow):
-- the receiver unlocks a FRESH Lv1 copy and the giver keeps theirs, but BOTH copies become non-tradeable
-- (mkt_cosmetic_unlock.tradeable = FALSE) so a pet can be shared once and never farmed/laundered.
ALTER TABLE mkt_trade_offer ADD COLUMN IF NOT EXISTS offered_pets   jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE mkt_trade_offer ADD COLUMN IF NOT EXISTS requested_pets jsonb NOT NULL DEFAULT '[]'::jsonb;
