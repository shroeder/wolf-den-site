-- Badges for the two things the Den rewarded with nothing: spotting the hidden Town glimmer, and PASSING ON your
-- own art. Both are granted imperatively (grantEventBadge) at their event sites — claimShiny() and the creation
-- share mint — so none of them carry an auto_rule. Marked secret, like the other event badges: hidden until
-- earned, never admin-assignable, no spoiler in the badge list telling people a secret exists.
--
-- Sort orders continue past the farming/creation block (231 → 236-253) and the town/raid block.

-- ── THE HIDDEN GLIMMER (town secret) ──────────────────────────────────────────────────────────────────────────
-- The rarest repeatable act in the game: it spawns at most twice a day, lasts 3 hours, and exactly ONE member in
-- the whole Den can claim each one. Two spots is already an outlier; five means you're the person who looks up.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, secret, sort_order) VALUES
    ('glimmer_spotter', 'Eagle Eye',      'Spotted the hidden glimmer over Town and claimed it first.', '✨', '#ffe488', FALSE, NULL, NULL, TRUE, 300),
    ('glimmer_keeper',  'Glimmer Keeper',  'Claimed the hidden Town glimmer twice.',                    '🌟', '#ffd75e', FALSE, NULL, NULL, TRUE, 301),
    ('glimmer_hoarder', 'Star Collector',  'Claimed five glimmers. Nothing gets past you.',             '💫', '#c9a2ff', FALSE, NULL, NULL, TRUE, 302),
    ('glimmer_complete','Constellation',   'Collected every single glimmer-exclusive decoration.',      '🌌', '#8fd8ff', FALSE, NULL, NULL, TRUE, 303)
ON CONFLICT (slug) DO NOTHING;

-- ── SHARING CREATIONS ─────────────────────────────────────────────────────────────────────────────────────────
-- Each creation can be passed on exactly once, so every one of these costs the artist something real and
-- permanent. Both sides get recognised: the giver for spending a one-time share, the receiver for collecting
-- other people's art, and the pair who traded art with each other.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, secret, sort_order) VALUES
    ('share_generous',  'Shared the Vision', 'Gave another member a copy of one of your creations.',        '🎁', '#c9a2ff', FALSE, NULL, NULL, TRUE, 304),
    ('share_patron',    'Open Studio',       'Shared three of your creations with the pack.',               '🖼️', '#a06bff', FALSE, NULL, NULL, TRUE, 305),
    ('share_legacy',    'Legacy',            'Shared ten creations. Your work hangs on farms across the Den.', '🏛️', '#ffd75e', FALSE, NULL, NULL, TRUE, 306),
    ('share_collector', 'Art Collector',     'Received a copy of another member''s creation.',              '🤝', '#7ec8ff', FALSE, NULL, NULL, TRUE, 307),
    ('share_gallery',   'Private Gallery',   'Collected five creations made by other members.',             '🎭', '#5aa0e0', FALSE, NULL, NULL, TRUE, 308),
    ('share_mutual',    'Kindred Spirits',   'Traded art both ways with the same member.',                  '💞', '#ff9ec4', FALSE, NULL, NULL, TRUE, 309)
ON CONFLICT (slug) DO NOTHING;
