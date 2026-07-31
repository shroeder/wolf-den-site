-- Charge gold for a hero-sprite REDRAW.
--
-- Your first sprite stays free — a member without a hero is a member with a blank in every roster, and charging
-- for that would be charging to exist. What costs money is the REDRAW: change a hat, swap a weapon, and the
-- server redraws the whole sprite at OpenAI's expense, once per member per 24 hours, indefinitely.
--
-- 56 draws in the last 7 days at 73 members. At 300 that's ~230 a week with nothing in the loop deciding
-- whether the change was worth redrawing for. Gold is the right gate: members have plenty, it makes the choice
-- deliberate, and it costs them nothing real.
--
-- hero_redraws counts LIFETIME paid redraws so the price can climb. The first few are cheap enough to feel
-- free; someone re-rolling their look every day pays for the privilege.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS hero_redraws INTEGER NOT NULL DEFAULT 0;

-- Members who already have a sprite shouldn't be billed for the gear change they made before this existed:
-- clear the pending flags so nobody's next login opens with an unexpected charge.
UPDATE mkt_buyer
   SET equipment_updated_at = avatar_sprite_at,
       avatar_updated_at = LEAST(COALESCE(avatar_updated_at, avatar_sprite_at), avatar_sprite_at)
 WHERE avatar_sprite_url IS NOT NULL
   AND avatar_sprite_at IS NOT NULL
   AND (equipment_updated_at > avatar_sprite_at OR avatar_updated_at > avatar_sprite_at);
