-- Forge attunement + elemental badges (secret — earned by playing with the Forge's Attune tab & scrolls).
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, secret, sort_order) VALUES
    ('forge_attuned',       'Attuned',       'Rolled your first Forge attunement — a bonus spin-off stat on a piece of gear.', '🔮', '#b878ff', FALSE, NULL, NULL, TRUE, 908),
    ('forge_dual_affinity', 'Twin-Souled',   'Forged a piece of gear with DUAL elemental affinity.',                          '☯️', '#37f5c0', FALSE, NULL, NULL, TRUE, 909),
    ('forge_enchanter',     'Runescribe',    'Used an Enchantment Scroll to bind a new affinity to a piece of gear.',          '🪄', '#ffd75e', FALSE, NULL, NULL, TRUE, 910)
ON CONFLICT (slug) DO NOTHING;
