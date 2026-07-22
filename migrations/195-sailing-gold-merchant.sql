-- Gold Merchant island event: a rare merchant who appears when you reach the island (before the dig). His
-- offer (rolled once per voyage) lives in merchant_json: the coin-catch minigame result, the discounted
-- exclusive shop, and whether the merchant-exclusive elephant pet is on offer. NULL = not yet rolled this
-- voyage; {"none":true} = rolled, no merchant; an object = the merchant is here.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS merchant_json jsonb;

-- Register the merchant-exclusive pet's sprite (local die-cut art). flip=true so it faces right in battle
-- (the art faces left). facing already resolved, so mark it checked to skip the auto-orient pass.
INSERT INTO mkt_pet_sprite (pet_id, url, flip, facing_checked_at, oriented_at, updated_at)
VALUES ('elephant_spear', '/images/sailing/pet-elephant.png', TRUE, NOW(), NOW(), NOW())
ON CONFLICT (pet_id) DO UPDATE SET url = EXCLUDED.url, flip = EXCLUDED.flip, updated_at = NOW();
