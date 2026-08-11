-- ── BADGES FOR THE LONGEST ROAD IN THE PETS SYSTEM ───────────────────────────────────────────────────────────
-- Enshrining is six weeks on ONE animal — only the equipped pet earns, so the price of the climb is that you
-- cannot be swapping while you make it — plus a chase item somebody had to go and find. It shipped with no
-- recognition at all, which made it the biggest achievement in the pets system and the only one the game never
-- said a word about.
--
-- Driven by the same auto_rule machinery every other pet badge uses (see 164-pet-level-badges.sql), so they
-- grant themselves on the next badge sync rather than needing their own grant call.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, sort_order)
VALUES
    ('pet_enshrined',   'Enshriner',    'Enshrined a pet at Lv 6 — its ability is permanent',  '✦', '#ffe08a', FALSE, 'pets_enshrined', 1,  72),
    ('pet_reliquary',   'Reliquary',    'Enshrined 3 pets',                                    '✦', '#d3b0ff', FALSE, 'pets_enshrined', 3,  73),
    ('pet_pantheon',    'Pantheon',     'Enshrined 10 pets',                                   '✦', '#b061ff', FALSE, 'pets_enshrined', 10, 74),
    -- Both stones, because the two are a CHOICE and using only one is the easy version of that choice.
    ('pet_both_stones', 'Light and Dark', 'Enshrined pets with both a Lightstone and a Darkstone', '☯', '#c9a0ff', FALSE, 'pet_both_stones', 1, 75)
ON CONFLICT (slug) DO NOTHING;
