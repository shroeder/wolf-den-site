-- Equipped profile FRAME — a cosmetic textured border drawn inset from the card edge. Sibling to
-- equipped_border (avatar ring) and equipped_background (card scene). NULL = none. Id validated against
-- the FRAMES catalog (src/lib/marketplace/frames.js) + the member's level at equip time.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS equipped_frame TEXT;
