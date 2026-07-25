-- Farming, Creations, and Invite/Referral badges.
--   • The threshold badges auto-award from metrics computed in getMemberMetrics / progressForRule
--     (crops_harvested, crop_types, decos_placed, farm_ratings_received, fertilizer_used, pig_claims,
--     creations_made, referrals_converted). syncEarnedBadges is called at each event site.
--   • The two "event" Creations badges (Curator, Patron) carry no auto_rule — they're granted imperatively
--     via grantEventBadge at the place-own-creation / buy-a-bundle sites, so they're marked secret like the
--     sailing/merchant event badges (hidden until earned, never admin-assignable).
-- High sort_order so none of these ever hijack a member's showcase. New badges render their emoji until AI
-- die-cut art is generated via /api/admin/badge-sprites.

-- ── Farming ──
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, sort_order) VALUES
    ('green_thumb',      'Green Thumb',      'Harvested 250 crops from your farm.',                 '🌱', '#5fbf4a', FALSE, 'crops_harvested',        250, 236),
    ('master_gardener',  'Master Gardener',  'Harvested 500 crops — a true green giant.',           '🌻', '#e0a92e', FALSE, 'crops_harvested',        500, 237),
    ('botanist',         'Botanist',         'Harvested at least one of every crop type.',          '🪴', '#3fae6a', FALSE, 'crop_types',             9,   238),
    ('decorator',        'Decorator',        'Placed 10 decorations around your farm.',             '🎨', '#c9a2ff', FALSE, 'decos_placed',           10,  239),
    ('landscaper',       'Landscaper',       'Placed 50 decorations — a farm worth visiting.',      '🏡', '#7bbf5a', FALSE, 'decos_placed',           50,  240),
    ('well_liked',       'Well-Liked',       'Your farm earned 10 ratings from the pack.',          '💚', '#7ec8ff', FALSE, 'farm_ratings_received',  10,  241),
    ('adored',           'Adored',           'Your farm earned 50 ratings from the pack.',          '🌟', '#ffd75e', FALSE, 'farm_ratings_received',  50,  242),
    ('fertilizer_baron', 'Fertilizer Baron', 'Fed the soil with fertilizer 25 times.',              '🧪', '#b5843f', FALSE, 'fertilizer_used',        25,  243),
    ('pig_whisperer',    'Pig Whisperer',    'Coaxed the Wild Loot Pig 25 times.',                  '🐷', '#ff9ec4', FALSE, 'pig_claims',             25,  244),
    ('pig_tycoon',       'Pig Tycoon',       'Coaxed the Wild Loot Pig 100 times.',                 '🪙', '#ffcf40', FALSE, 'pig_claims',             100, 245)
ON CONFLICT (slug) DO NOTHING;

-- ── Creations ──
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, sort_order) VALUES
    ('creation_first',   'First Creation',   'Finalized your very first custom creation.',          '🎨', '#c9a2ff', FALSE, 'creations_made', 1,  246),
    ('creation_artisan', 'Artisan',          'Crafted 5 custom creations.',                         '🖌️', '#a06bff', FALSE, 'creations_made', 5,  247),
    ('creation_gallery', 'Gallery',          'Own a gallery of 15 custom creations.',               '🖼️', '#d4af37', FALSE, 'creations_made', 15, 248)
ON CONFLICT (slug) DO NOTHING;

-- Event Creations badges — no auto_rule (granted imperatively), so secret like the sailing/merchant ones.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, secret, sort_order) VALUES
    ('creation_curator', 'Curator', 'Placed one of your own creations on your farm.', '🏛️', '#8fd8ff', FALSE, NULL, NULL, TRUE, 249),
    ('creation_patron',  'Patron',  'Backed the artists — bought a Creation Token bundle.', '💳', '#ffd75e', FALSE, NULL, NULL, TRUE, 250)
ON CONFLICT (slug) DO NOTHING;

-- ── Invite / Referral ──
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, sort_order) VALUES
    ('referral_recruiter',   'Recruiter',    'Invited a friend who joined the pack.',       '🤝', '#7bbf5a', FALSE, 'referrals_converted', 1,  251),
    ('referral_packbuilder', 'Pack Builder', 'Three friends joined with your invite.',       '🐺', '#5aa0e0', FALSE, 'referrals_converted', 3,  252),
    ('referral_packleader',  'Pack Leader',  'Ten friends joined the pack with your invite.', '👑', '#ffd75e', FALSE, 'referrals_converted', 10, 253)
ON CONFLICT (slug) DO NOTHING;
