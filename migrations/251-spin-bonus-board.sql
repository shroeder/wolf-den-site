-- Match-3 BONUS GAME: the active board is kept server-side so tiles stay hidden until the player flips them
-- (prevents peeking/cheating). One row per player, overwritten each time the bonus is triggered.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS spin_bonus JSONB;

-- Four more wheel-exclusive gear pieces (rare) → richer match-3 board. Sprites in public/images/spin/gear.
INSERT INTO mkt_item_sprite (item_id, url) VALUES
    ('wg_chest', '/images/spin/gear/wg-chest.png'),
    ('wg_belt',  '/images/spin/gear/wg-belt.png'),
    ('wg_boots', '/images/spin/gear/wg-boots.png'),
    ('wg_axe',   '/images/spin/gear/wg-axe.png')
ON CONFLICT (item_id) DO UPDATE SET url = EXCLUDED.url;
