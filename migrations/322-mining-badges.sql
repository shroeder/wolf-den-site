-- Mining had no badges at all. Every other feature marks its milestones — digging, raiding, fishing, cooking —
-- so the one loop with a skill ceiling and a rank screen had nothing to show for it.
--
-- Six, covering the three things the mine actually asks of you: show up (trips), swing well (MASTERWORK), and
-- push your luck (depth). Deliberately no "mine N ore" grind badge — ore is the currency, not the achievement.
INSERT INTO mkt_badge (slug, label, description, icon, color, sort_order) VALUES
    ('mine_first',      'First Swing',      'Cracked your first seam open.',                              '⛏️', '#cfd6dd', 240),
    ('mine_masterwork', 'Masterwork',       'Broke a seam with a MASTERWORK run — 88% of a flawless one.', '🔨', '#ffd75e', 241),
    ('mine_deep',       'Deep Delver',      'Reached depth 8 in a single descent.',                        '🕳', '#b98cff', 242),
    ('mine_nerve',      'Nerve of Iron',    'Stopped and dug at depth 6 or deeper — with the haul intact.', '🏮', '#8fe3ff', 243),
    ('mine_emberheart', 'Emberheart',       'Cracked an Emberheart Geode, the richest rock in the mine.',   '💠', '#ffb020', 244),
    ('mine_forgefed',   'Forge-Fed',        'Smelted 100 ore into forge parts.',                            '🏭', '#ff9a5c', 245)
ON CONFLICT (slug) DO NOTHING;

-- Counter for the Forge-Fed badge. Ore melted, all-time.
ALTER TABLE mkt_mining ADD COLUMN IF NOT EXISTS ore_smelted INT NOT NULL DEFAULT 0;
