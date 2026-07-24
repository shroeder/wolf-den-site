-- Farming + petting badges (auto-awarded from the activity counts computed in getMemberMetrics /
-- progressForRule: crops_harvested, pets_petted, pets_fed_others). High sort_order so they never hijack the
-- showcase. New badges show their emoji until AI die-cut art is generated via /api/admin/badge-sprites.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, sort_order) VALUES
    ('farm_first',  'First Harvest',   'Harvested your first crop',              '🌾', '#c9a227', FALSE, 'crops_harvested', 1,   230),
    ('farm_hand',   'Farmhand',        'Harvested 25 crops',                     '🧑‍🌾', '#7bbf5a', FALSE, 'crops_harvested', 25,  231),
    ('farm_master', 'Master Farmer',   'Harvested 100 crops',                    '🚜', '#4e9c3a', FALSE, 'crops_harvested', 100, 232),
    ('pet_pal',     'Pet Pal',         'Petted a pet 25 times',                  '❤️', '#ff7aa8', FALSE, 'pets_petted',     25,  233),
    ('pet_devoted', 'Devoted Keeper',  'Petted a pet 100 times',                 '💞', '#ff4f8b', FALSE, 'pets_petted',     100, 234),
    ('farm_giver',  'Generous Soul',   'Fed 10 treats to other players'' pets',  '🎁', '#ffcf40', FALSE, 'pets_fed_others', 10,  235)
ON CONFLICT (slug) DO NOTHING;
